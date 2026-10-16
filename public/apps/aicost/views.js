// UI: Product -> "AI costs" (dev spend + in-product inference) and Money -> "Perks & credits". Handlers use ctx.act so
// every action charges founder hours. The pure logic lives in coding.js, inference.js and credits.js.

import { html, on, formData, toast } from '../../core/ui.js';
import { money, pct, fmtDate, round2 } from '../../core/util.js';
import { mrr } from '../../core/stripe.js';
import {
  MODEL_TIERS, TIER_ORDER, FEATURE_TYPES, PROVIDERS, MARGIN_BENCH, EVALS, SEAT_PLANS, CODING, CLOUD, PASS_THROUGH, BUDGET, DEPRECATION, FREE_TIER,
} from '../../data/ai-costs.js';
import { PROGRAMS, programById, tierById, CREDIT_PARAMS } from '../../data/credit-programs.js';
import { aiSlice, perksSlice } from './model.js';
import {
  aiFeatures, inferenceModel, marginPicture, featureCfg, runEval, setFeature, setRouting, setLimits, setFreeTier, setBudget, setPricing, setProvider,
  pendingDeprecations, migrateDeprecation, accountsOf, requestCost, addonAdoption, providerSwitchHours,
} from './inference.js';
import { engineers, codingPicture, setCodingPolicy, assignSeat, auditCoding, rightSizeAll, SEAT_ORDER } from './coding.js';
import {
  eligibility, applyToProgram, adoptTool, planCliff, cliffSchedule, moveCloud, setFootprint, perksSummary, totalBalance, creditsLedger, burnPerMonth, switchingHours, perksContext,
} from './credits.js';

const usd = (n, c = false) => money(n, { cents: c });
const opt = (map, cur) => Object.entries(map).map(([k, v]) => html`<option value="${k}" ${String(cur) === k ? 'selected' : ''}>${typeof v === 'string' ? v : v.label}</option>`);
const meter = (v, tone = '') => html`<div class="meter"><div style="width:${Math.max(0, Math.min(100, v * 100))}%;${tone ? `background:var(${tone})` : ''}"></div></div>`;
const num = (v, d = '') => (v == null ? d : v);

// ---------------------------------------------------------------------------------------------------------
// Product -> AI costs
// ---------------------------------------------------------------------------------------------------------

export function renderAiCosts(ctx) {
  const s = ctx.state;
  const feats = aiFeatures(s);
  const eng = engineers(s);
  return html`
    ${feats.length ? inferencePanels(s) : html`<section class="panel"><h2>In-product AI</h2><p class="small muted">No shipped feature calls an LLM at runtime yet. Tick "This feature calls an LLM for users at runtime" in a spec; when it ships, every active user generates requests and the bill lands in COGS here.</p></section>`}
    ${devPanel(s, eng)}`;
}

function inferencePanels(s) {
  const S = aiSlice(s), inf = S.inf;
  const model = inferenceModel(s);
  const mp = marginPicture(s, model);
  const mtd = inf.mtd.month ? inf.mtd : { usd: 0, extra: 0, byFeature: {}, byModel: {} };
  const bench = MARGIN_BENCH;
  const gm = mp.revenue > 0 ? 1 - mp.aiShare : null;
  const budgetLeft = inf.budget.usd != null ? inf.budget.usd - (mtd.usd + mtd.extra) : null;
  const deps = pendingDeprecations(s);
  const lastEvals = inf.evals.slice(-4).reverse();
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">AI inference / month</div><div class="stat-value">${usd(model.total)}</div><div class="stat-sub">MTD ${usd(mtd.usd + mtd.extra)}${mtd.extra ? html` incl. <span class="neg">${usd(mtd.extra)} unusual</span>` : ''}</div></div>
      <div class="stat"><div class="stat-label">Cost per active user</div><div class="stat-value">${usd(model.perActiveUser, true)}</div><div class="stat-sub">${model.paidUsers} paid user(s)${model.freeUsers ? ` + ${Math.round(model.freeUsers)} free` : ''}</div></div>
      <div class="stat ${mp.aiShare > 0.4 ? 'bad' : mp.aiShare > 0.25 ? 'warn' : ''}"><div class="stat-label">Gross margin hit</div><div class="stat-value">${gm == null ? '—' : pct(mp.aiShare, 0)} of revenue</div><div class="stat-sub">AI-native margins ~${Math.round(bench.aiNative[0] * 100)}-${Math.round(bench.aiNative[1] * 100)}% vs classic SaaS ${Math.round(bench.classic[0] * 100)}-${Math.round(bench.classic[1] * 100)}% [secondary]</div></div>
      <div class="stat ${mp.underwaterLoss > Math.max(50, 0.04 * mp.revenue) ? 'bad' : ''}"><div class="stat-label">Heavy users under water</div><div class="stat-value">${usd(mp.underwaterLoss)}/mo</div><div class="stat-sub">p90 user costs ${usd(mp.p90Cost, true)} vs ${usd(mp.revPerUser, true)} paid</div></div>
    </div>
    ${deps.length ? html`<section class="panel"><h2>Model retirement notices <span class="badge warn">${deps.length}</span></h2>
      ${deps.map((d) => html`<div class="callout warn small"><b>${MODEL_TIERS[d.tier].label}</b> retires ${fmtDate(s, d.retireDay)} (${d.retireDay - s.day} days). ${aiFeatures(s).filter((f) => featureCfg(s, f).model === d.tier).length} feature(s) are pinned to it.
        <div class="inline" style="margin-top:6px"><button data-aimig="${d.id}" data-evals="1">Migrate with evals</button> <button data-aimig="${d.id}" data-evals="0">Migrate without evals</button></div></div>`)}
      <p class="small muted">Retirement notices run ${DEPRECATION.noticeDays[0]}-${DEPRECATION.noticeDays[1]} days [design]. Past the date the provider cuts you over: errors for ~2 weeks and a quality regression.</p></section>` : ''}
    <section class="panel"><h2>Features, models and tokens</h2>
      <div class="table-wrap"><table><thead><tr><th>Feature</th><th>Type</th><th>Model</th><th class="r">Req/user/mo</th><th>Cache</th><th>Batch</th><th class="r">$/user/mo</th><th class="r">Quality</th><th></th></tr></thead><tbody>
      ${model.feats.map((x) => html`<tr data-aif="${x.id}"><td>${x.title || '(untitled)'}</td><td class="small">${FEATURE_TYPES[x.cfg.type].label}<div class="muted">${(FEATURE_TYPES[x.cfg.type].in / 1000).toFixed(0)}k in / ${FEATURE_TYPES[x.cfg.type].out} out</div></td>
        <td><select data-ai-model>${opt(Object.fromEntries(TIER_ORDER.map((t) => [t, `${MODEL_TIERS[t].label} ($${MODEL_TIERS[t].in}/$${MODEL_TIERS[t].out} per M)`])), x.cfg.model)}</select></td>
        <td class="r"><input data-ai-reqs type="number" min="1" style="width:70px" value="${x.cfg.reqs}" /></td>
        <td><select data-ai-cache>${opt({ off: 'Off', prompt: 'Prompt caching', aggressive: 'Aggressive (+response cache)' }, x.cfg.cache)}</select></td>
        <td><input data-ai-batch type="checkbox" ${x.cfg.batch ? 'checked' : ''} ${FEATURE_TYPES[x.cfg.type].batchable ? '' : 'disabled'} title="50% off the asynchronous share" /></td>
        <td class="r">${usd(x.perUser, true)}</td><td class="r small">${x.q < (x.cfg.baseQ ?? x.q) - 0.01 ? html`<span class="neg">${Math.round(x.q * 100)}%</span>` : `${Math.round(x.q * 100)}%`}</td>
        <td style="white-space:nowrap"><button class="sm" data-ai-eval>Run evals (${EVALS.hours} h, $${EVALS.usd})</button> <button class="sm" data-ai-apply>Apply</button></td></tr>`)}
      </tbody></table></div>
      <p class="small muted">Prices per million tokens: frontier $5 in / $25 out, mid $2 / $10, small ~$0.25 / $1.25 [official list prices, small tier a blend]. Cache reads cost ~10% of input, batch is 50% off async work. Quality is hidden: only an eval run on a candidate setup shows how it compares before you switch.</p>
      ${lastEvals.length ? html`<p class="small">Recent evals: ${lastEvals.map((e) => html`<span class="badge ${e.pass ? 'good' : 'bad'}">${e.key.replace('|', ' / ')} → ${Math.round(e.ratio * 100)}% of current</span> `)}</p>` : ''}
    </section>
    <div class="grid-2">
      <section class="panel"><h2>Where the money goes</h2>
        ${model.feats.map((x) => html`<div class="small">${x.title || '(untitled)'} <span class="muted">${usd(x.total)}</span>${meter(model.total ? x.total / model.total : 0)}</div>`)}
        <h3>By model</h3>
        ${Object.entries(model.byModel).map(([t, v]) => html`<div class="small">${MODEL_TIERS[t].label} <span class="muted">${usd(v)}</span>${meter(model.total ? v / model.total : 0)}</div>`)}
        ${model.free ? html`<p class="small">Free tier: ${usd(model.free)} casual use + <span class="${model.bots > 100 ? 'neg' : ''}">${usd(model.bots)} scripted / heavy accounts</span>.</p>` : ''}
        <h3>Last months</h3>
        <div class="small">${inf.hist.slice(-6).map((h) => html`<div>${h.month}: ${usd(h.total)}${h.extra ? html` <span class="neg">(+${usd(h.extra)} unusual)</span>` : ''} · ${usd(h.perActiveUser, true)}/user</div>`) || ''}${inf.hist.length ? '' : html`<span class="muted">First bill posts at month end.</span>`}</div>
      </section>
      <section class="panel"><h2>Budget, alerts and guardrails</h2>
        <form id="aiBudget" class="inline"><label>Monthly AI budget <input name="usd" type="number" min="0" style="width:90px" value="${num(inf.budget.usd)}" /></label> <label class="inline-check"><input name="alerts" type="checkbox" ${inf.budget.alerts ? 'checked' : ''} style="width:auto" /> Alerts at 75% / 90%</label> <button class="sm" type="submit">Save (${BUDGET.setupHours} h)</button></form>
        ${budgetLeft != null ? html`<p class="small ${budgetLeft < 0 ? 'neg' : ''}">${budgetLeft >= 0 ? `${usd(budgetLeft)} left this month` : `${usd(-budgetLeft)} over budget`}</p>` : ''}
        <form id="aiLimits" class="inline"><label>Per-user fair-use cap (× avg user) <input name="perUserMult" type="number" min="1" step="0.5" style="width:70px" value="${num(inf.limits.perUserMult)}" placeholder="none" /></label> <label class="inline-check"><input name="agentTokenCap" type="checkbox" ${inf.limits.agentTokenCap ? 'checked' : ''} style="width:auto" /> Per-task token cap on agents</label> <button class="sm" type="submit">Save (1 h)</button></form>
        <form id="aiFree" class="inline" style="margin-top:8px"><label class="inline-check"><input name="enabled" type="checkbox" ${inf.freeTier.enabled ? 'checked' : ''} style="width:auto" /> Free AI tier (${FREE_TIER.ratio} free users per account)</label> <label>Cap (requests/mo) <input name="capReqs" type="number" min="1" style="width:70px" value="${num(inf.freeTier.capReqs)}" placeholder="none" /></label> <label class="inline-check"><input name="abuseGuard" type="checkbox" ${inf.freeTier.abuseGuard ? 'checked' : ''} style="width:auto" /> Verify signups (3 h)</label> <label>Model <select name="model">${opt({ same: 'Same as paid', small: 'Small model' }, inf.freeTier.model)}</select></label> <button class="sm" type="submit">Save</button></form>
        <form id="aiRoute" class="inline" style="margin-top:8px"><label class="inline-check"><input name="enabled" type="checkbox" ${inf.routing.enabled ? 'checked' : ''} style="width:auto" /> Route ${Math.round(inf.routing.share * 100)}% of easy requests to a small model</label> <label class="inline-check"><input name="tuned" type="checkbox" ${inf.routing.tuned ? 'checked disabled' : ''} style="width:auto" /> Tune the router with evals (${EVALS.routeHours + EVALS.hours} h)</label> <button class="sm" type="submit">Save</button></form>
        <form id="aiProv" class="inline" style="margin-top:8px"><label>Provider <select name="provider">${opt(Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, v.label])), inf.provider)}</select></label> <button class="sm" type="submit">Switch</button></form>
        <p class="small muted">Credits from AWS, Google, Azure or a lab only offset the matching provider's bill (<a href="#/bank/perks">Perks & credits</a>). Cloud marketplace endpoints take longer to move off.</p>
      </section>
    </div>
    <section class="panel"><h2>Pricing response: pass the cost through</h2>
      <form id="aiPricing" class="inline">
        <label>Mode <select name="mode">${opt({ absorb: 'Absorb it (unlimited AI in the plan)', credits: 'Included credit pool + paid top-ups', addon: 'AI add-on per account' }, inf.pricing.mode)}</select></label>
        <label>Included $/user/mo <input name="includedUsd" type="number" min="0" step="0.5" style="width:70px" value="${inf.pricing.includedUsd}" /></label>
        <label>Add-on $/account/mo <input name="addonPrice" type="number" min="1" style="width:70px" value="${inf.pricing.addonPrice}" /></label>
        <button class="sm" type="submit">Save (${PASS_THROUGH.hours} h)</button></form>
      <p class="small muted">Credits bill overage at ${PASS_THROUGH.markup}x cost through Stripe; heavy users hitting the wall add churn friction. An add-on at $${inf.pricing.addonPrice} is bought by ~${Math.round(addonAdoption(inf.pricing.addonPrice) * 100)}% of accounts [design]. In a vendor survey 44% of AI vendors absorb inference fully, 42% partly pass it through and 13% fully [unverified, self-reported]. Pass-through so far: ${usd(inf.passRevenue ?? 0)}.</p>
    </section>`;
}

function devPanel(s, eng) {
  const S = aiSlice(s), c = S.coding;
  const pic = codingPicture(s);
  const audited = c.audits > 0;
  const hist = c.hist.slice(-4);
  return html`<section class="panel"><h2>AI coding spend (${eng.length} engineer${eng.length === 1 ? '' : 's'})</h2>
    ${eng.length ? html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Seats + API this month</div><div class="stat-value">${usd(pic.total)}</div><div class="stat-sub">${usd(pic.seatUsd)} seats + ${usd(pic.apiUsd)} API overage</div></div>
      <div class="stat"><div class="stat-label">Per engineer</div><div class="stat-value">${usd(pic.total / eng.length)}</div><div class="stat-sub">reports range $200-600 typical, a tail past $1,000-5,000 [secondary]</div></div>
      <div class="stat ${pic.waste > 0.15 * pic.total ? 'warn' : ''}"><div class="stat-label">Overspend vs best-fit seats</div><div class="stat-value">${audited ? usd(pic.waste) : '?'}</div><div class="stat-sub">${audited ? 'from your last audit' : 'audit the admin consoles to see usage'}</div></div>
      <div class="stat ${pic.limitedShare > 0.15 ? 'warn' : ''}"><div class="stat-label">Slowed by usage limits</div><div class="stat-value">${pct(pic.limitedShare, 0)}</div><div class="stat-sub">of seats hit a window or weekly limit</div></div>
    </div>
    <form id="aiCoding" class="inline">
      <label>Default seat <select name="policy">${opt({ shadow: 'Everyone buys their own (individual)', ...Object.fromEntries(SEAT_ORDER.map((k) => [k, `${SEAT_PLANS[k].label} · $${SEAT_PLANS[k].price}`])) }, c.policy)}</select></label>
      <label>At the limit <select name="overage">${opt({ api: 'Pay API rates beyond the seat', wait: 'Wait for the window to reset' }, c.overage)}</select></label>
      <label>Per-seat API cap $ <input name="capUsd" type="number" min="0" style="width:80px" value="${num(c.capUsd)}" placeholder="none" /></label>
      <label class="inline-check"><input name="alerts" type="checkbox" ${c.alerts ? 'checked' : ''} style="width:auto" /> Spend alerts</label>
      <label class="inline-check"><input name="hardLimit" type="checkbox" ${c.hardLimit ? 'checked' : ''} style="width:auto" /> Prepaid hard limit</label>
      <label>API keys <select name="keyMode">${opt({ shared: 'One shared key', scoped: 'Scoped per environment (2 h)' }, c.keyMode)}</select></label>
      <button class="sm" type="submit">Save (${CODING.setupHours} h)</button></form>
    <div class="app-actions"><button id="aiAudit">Audit usage (${CODING.auditHours} h)</button> <button id="aiRight" ${audited ? '' : 'disabled'}>Right-size every seat</button></div>
    <div class="table-wrap"><table><thead><tr><th>Engineer</th><th>Seat</th><th class="r">Usage (API-equiv.)</th><th class="r">This month</th><th>Best fit</th></tr></thead><tbody>
      ${pic.rows.map((r) => html`<tr><td>${r.name}</td><td><select data-aiseat="${r.id}">${opt(Object.fromEntries(SEAT_ORDER.map((k) => [k, `${SEAT_PLANS[k].label} · $${SEAT_PLANS[k].price}`])), r.plan)}</select></td>
        <td class="r">${audited ? usd(r.usage) : html`<span class="muted">audit</span>`}</td><td class="r">${usd(r.total)}${r.limitedShare > 0.1 ? html` <span class="badge warn">limited</span>` : ''}</td><td class="small">${audited ? (r.best === r.plan ? 'ok' : SEAT_PLANS[r.best].label) : ''}</td></tr>`)}
    </tbody></table></div>
    ${hist.length ? html`<p class="small muted">${hist.map((h) => `${h.month}: ${usd(h.seats + h.api)}${h.extra ? ` (incl. ${usd(h.extra)} incident)` : ''}`).join(' · ')}</p>` : ''}
    <p class="small muted">Seat prices: individual ~$20, team standard $25, team premium $125, power $100-200 [official / unverified]; a heavy agentic month on API rates costs several times a power seat. Usage is heavy-tailed; limits slow engineers down, a leaked shared key or unattended agent loop turns into a four-figure bill. Seats post as software, API overage as software (R&D, not COGS).</p>`
    : html`<p class="small muted">No engineers yet. Hire in <a href="#/people">People</a>; each active engineer takes a seat and an API budget. Your own plan is in the Build tab.</p>`}
  </section>`;
}

export function wireAiCosts(root, ctx) {
  const row = (el) => el.closest('tr[data-aif]');
  const rowCfg = (tr) => ({
    model: tr.querySelector('[data-ai-model]').value, cache: tr.querySelector('[data-ai-cache]').value,
    reqs: Math.max(1, Number(tr.querySelector('[data-ai-reqs]').value) || 1), batch: tr.querySelector('[data-ai-batch]').checked,
  });
  on(root, 'click', '[data-ai-eval]', (e, el) => { const tr = row(el); const c = rowCfg(tr); ctx.act((st) => { const r = runEval(st, tr.dataset.aif, { model: c.model, cache: c.cache }); toast(`Eval: the candidate scores ${Math.round(r.ratio * 100)}% of today's quality (${r.pass ? 'safe to switch' : 'a regression'}).`, r.pass ? 'good' : 'warn'); }, { hours: EVALS.hours, label: 'Model evals' }); });
  on(root, 'click', '[data-ai-apply]', (e, el) => { const tr = row(el); const c = rowCfg(tr); ctx.act((st) => { const r = setFeature(st, tr.dataset.aif, c); toast(r.dq < -0.04 && !r.evaled ? 'Switched. Quality fell: watch activation and retention (and run evals next time).' : 'Applied.', r.dq < -0.04 && !r.evaled ? 'warn' : 'good'); }, { hours: 0.5, label: 'AI feature config' }); });
  on(root, 'click', '[data-aimig]', (e, el) => { const w = el.dataset.evals === '1'; ctx.act((st) => { const r = migrateDeprecation(st, el.dataset.aimig, { withEvals: w, toModel: null }); if (!r.ok) throw new Error(r.error); toast(`Migrated ${r.features} feature(s).`, 'good'); }, { hours: 6 + (w ? EVALS.hours : 0), label: 'Model migration' }); });
  on(root, 'submit', '#aiBudget', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setBudget(st, { usd: f.usd, alerts: f.alerts }), { hours: BUDGET.setupHours, label: 'AI budget and alerts' }); });
  on(root, 'submit', '#aiLimits', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setLimits(st, { perUserMult: f.perUserMult, agentTokenCap: f.agentTokenCap }), { hours: 1, label: 'Rate limits' }); });
  on(root, 'submit', '#aiFree', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setFreeTier(st, { enabled: f.enabled, capReqs: f.capReqs, abuseGuard: f.abuseGuard, model: f.model }), { hours: 1, label: 'Free tier controls' }); });
  on(root, 'submit', '#aiRoute', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setRouting(st, { enabled: f.enabled, tuned: f.tuned }), { hours: f.tuned && !aiSlice(ctx.state).inf.routing.tuned ? EVALS.routeHours + EVALS.hours : 0.5, label: 'Model routing' }); });
  on(root, 'submit', '#aiProv', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => { const r = setProvider(st, f.provider); if (!r.ok) throw new Error(r.error); toast(`Switched provider (${r.hours} h of migration work).`, 'info'); }, { hours: providerSwitchHours(ctx.state, f.provider), label: 'Switch inference provider' }); });
  on(root, 'submit', '#aiPricing', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setPricing(st, f), { hours: PASS_THROUGH.hours, label: 'AI pricing' }); });
  on(root, 'submit', '#aiCoding', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => setCodingPolicy(st, f), { hours: CODING.setupHours + (f.keyMode === 'scoped' ? 2 : 0), label: 'AI coding spend policy' }); });
  on(root, 'click', '#aiAudit', () => ctx.act((st) => auditCoding(st), { hours: CODING.auditHours, label: 'Audit AI coding usage' }));
  on(root, 'click', '#aiRight', () => ctx.act((st) => rightSizeAll(st), { hours: 0.5, label: 'Right-size AI seats' }));
  on(root, 'change', '[data-aiseat]', (e, el) => ctx.act((st) => assignSeat(st, el.dataset.aiseat, el.value)));
}

// ---------------------------------------------------------------------------------------------------------
// Money -> Perks & credits
// ---------------------------------------------------------------------------------------------------------

export function perksView(s) {
  const perks = perksSlice(s);
  const sum = perksSummary(s);
  const cliffs = cliffSchedule(s);
  const x = perksContext(s);
  const groups = [...new Set(PROGRAMS.map((p) => p.group))];
  const led = creditsLedger(s);
  const cl = perks.cloud;
  return html`
    <div class="stats">
      <div class="stat"><div class="stat-label">Credit balance</div><div class="stat-value">${usd(sum.balance)}</div><div class="stat-sub">not cash and not runway</div></div>
      <div class="stat"><div class="stat-label">Applied to bills</div><div class="stat-value">${usd(sum.applied)}</div><div class="stat-sub">contra-expense, never income</div></div>
      <div class="stat"><div class="stat-label">Pending applications</div><div class="stat-value">${sum.pending}</div><div class="stat-sub">${perks.applications.length} total</div></div>
      <div class="stat ${cliffs.length ? 'warn' : ''}"><div class="stat-label">Credit cliffs ahead</div><div class="stat-value">${cliffs.length}</div><div class="stat-sub">${cliffs[0] ? `next ${fmtDate(s, cliffs[0].day)}: +${usd(cliffs[0].monthlyUsd)}/mo in cash` : 'none yet'}</div></div>
    </div>
    <div class="callout small">Programs and amounts below are <b>reported</b> ranges from aggregator pages, not verified terms ([unverified]); approval odds are a game model. Most founders without a referral capture <b>$5k-$30k</b>; funded or accelerator-referred founders can reach $100k-$350k nominal over 1-2 years, and only the part you really spend is worth anything. Credits offset matching bills before cash.</div>
    ${cliffs.length ? html`<section class="panel"><h2>Credit cliff (in your forecast)</h2>
      ${cliffs.map((c) => html`<div class="callout ${c.planned ? '' : 'warn'} small"><b>${c.name}</b> ${c.reason} ${fmtDate(s, c.day)} (${c.day - s.day} days): about <b>${usd(c.monthlyUsd)}/month</b> moves from credits to cash. ${c.planned ? html`<span class="badge good">plan recorded</span>` : html`
        <div class="inline" style="margin-top:6px">Plan: <button class="sm" data-plan="${c.creditId}:forecast">Budget it (${CREDIT_PARAMS.cliffPlanHours} h)</button> <button class="sm" data-plan="${c.creditId}:rightsize">Right-size now (${CREDIT_PARAMS.rightsizeHours} h)</button> <button class="sm" data-plan="${c.creditId}:migrate">Plan a migration</button> <button class="sm" data-plan="${c.creditId}:raise">Fund it in the raise</button></div>`}</div>`)}
      <p class="small muted">The 13-week forecast (Forecast tab, line-items method) adds these steps. A quick or AI-agent forecast extrapolates today's covered burn and misses them.</p></section>` : ''}
    <section class="panel"><h2>Your credits</h2>
      ${perks.credits.length ? html`<div class="table-wrap"><table><thead><tr><th>Credit</th><th class="r">Balance</th><th class="r">Applied</th><th>Covers</th><th>Expires</th><th>Status</th></tr></thead><tbody>
        ${perks.credits.map((c) => html`<tr><td>${c.name}</td><td class="r">${c.pct ? `${Math.round(c.pct * 100)}% off` : usd(c.balance)}<div class="small muted">of ${c.pct ? '-' : usd(c.amount)}</div></td><td class="r">${usd(c.used)}</td><td class="small">${c.provider ?? c.vendor}: ${c.covers.join(', ')}</td><td class="small">${fmtDate(s, c.expiryDay)}${c.status === 'active' ? '' : ''}</td><td><span class="badge ${c.status === 'active' ? 'good' : 'bad'}">${c.status}</span> ${c.status === 'active' && burnPerMonth(s, c) > 0 ? html`<span class="small muted">${usd(burnPerMonth(s, c))}/mo</span>` : ''}</td></tr>`)}
      </tbody></table></div>
      <p class="small muted">Books: credits are a <b>contra-expense</b>, not income. Each covered bill posts the net cash amount; the gross invoice and the credit applied are on the transaction (${led.count} so far: gross ${usd(led.gross)}, credits ${usd(led.credits)}, net ${usd(led.net)}). Unused credits are not cash: keep them out of runway.</p>`
        : html`<p class="small muted">No credits yet. Apply below; self-serve tiers decide in days, partner-gated ones in weeks.</p>`}
      ${perks.applications.length ? html`<h3>Applications</h3><div class="small">${perks.applications.slice().reverse().slice(0, 10).map((a) => { const p = programById(a.programId), t = tierById(p, a.tierId); return html`<div>${p.name} · ${t.label}: <span class="badge ${a.status === 'approved' ? 'good' : a.status === 'pending' ? '' : 'bad'}">${a.status}</span> ${a.status === 'pending' ? `decision ~${fmtDate(s, a.decisionDay)}` : a.reason ?? ''}</div>`; })}</div>` : ''}
    </section>
    <section class="panel"><h2>Cloud footprint and lock-in</h2>
      <p class="small">Hosting is on <b>${CLOUD.providers[cl.provider].label}</b>, footprint <b>${CLOUD.footprints[cl.footprint].label}</b>${cl.provider !== 'default' ? html` · bill ~${usd(cl.lastBill)}/mo` : ''}. Switching away now would take ~${switchingHours(s)} h.</p>
      <form id="cloudForm" class="inline"><label>Provider <select name="provider">${opt(Object.fromEntries(Object.entries(CLOUD.providers).map(([k, v]) => [k, v.label])), cl.provider)}</select></label>
        <label>Footprint <select name="footprint">${opt(Object.fromEntries(Object.entries(CLOUD.footprints).map(([k, v]) => [k, v.label])), cl.footprint)}</select></label> <button class="sm" type="submit">Apply (moving takes ${CLOUD.moveHours} h; right-sizing ${CLOUD.rightsizeHours} h)</button></form>
      <p class="small muted">Credits tempt you to build big (multi-region, managed everything) and to stay on one provider's AI and data services. When the credits end, the over-provisioned footprint is a cash bill and leaving costs more the longer you stay [design].</p></section>
    ${groups.map((g) => html`<section class="panel"><h2>${g}</h2>
      ${PROGRAMS.filter((p) => p.group === g).map((p) => html`<div class="card" style="margin-bottom:10px"><b>${p.name}</b>
        <p class="small muted">${p.note}</p>
        ${p.tiers.map((t) => { const el = eligibility(s, p.id, t.id); const done = perks.applications.some((a) => a.programId === p.id && a.tierId === t.id && (a.status === 'pending' || a.status === 'approved')); return html`<div style="border-top:1px solid var(--border,#ddd);padding:6px 0">
          <div><b>${t.label}</b> · ${t.pct ? `${Math.round(t.pct * 100)}% off` : t.grants ? 'bundle' : t.amount ? `up to ${usd(t.amount)}` : 'membership'} · ${t.months} mo · <span class="badge">${t.route}</span> · ${t.hours} h to apply · decision in ${t.delay[0]}-${t.delay[1]} days</div>
          <div class="small">${el.checks.map((c) => html`<span class="badge ${c.met ? 'good' : 'bad'}">${c.met ? '✓' : '✗'} ${c.label}</span> `)}</div>
          <div class="inline" style="margin-top:4px"><button class="sm ${el.eligible ? 'primary' : ''}" data-apply="${p.id}:${t.id}" ${done ? 'disabled' : ''}>${done ? 'Applied' : el.eligible ? 'Apply' : 'Apply anyway (not eligible)'}</button>${p.tool && t === p.tiers[0] ? html` <button class="sm" data-adopt="${p.id}">Start using ${p.tool.vendor} (${CREDIT_PARAMS.adoptToolHours} h)</button>` : ''}</div></div>`; })}
      </div>`)}
    </section>`)}
    <p class="small muted">Your state: website ${x.website ? '✓' : '✗'} · domain ${x.domain ? '✓' : '✗'} · LinkedIn ${x.linkedin ? '✓' : '✗'} · raised ${usd(x.raised)}${x.accelerator ? ' · accelerator ✓' : ''}${x.backed ? ' · funded/referral path ✓' : ' · no referral path'}.</p>`;
}

export function wirePerks(root, ctx) {
  on(root, 'click', '[data-apply]', (e, el) => {
    const [pid, tid] = el.dataset.apply.split(':');
    const t = tierById(programById(pid), tid);
    const el2 = eligibility(ctx.state, pid, tid);
    if (!el2.eligible && !confirm(`You do not meet: ${el2.failing.join('; ')}. Applying will cost ${t.hours} h and be rejected. Apply anyway?`)) return;
    ctx.act((st) => { const r = applyToProgram(st, pid, tid); if (!r.ok) throw new Error(r.error); toast(`Applied. Decision in ${t.delay[0]}-${t.delay[1]} days.`, 'info'); }, { hours: t.hours, label: `Credit application: ${programById(pid).name}` });
  });
  on(root, 'click', '[data-adopt]', (e, el) => ctx.act((st) => { const r = adoptTool(st, el.dataset.adopt); if (!r.ok) throw new Error(r.error); toast('Tool added to your stack; the perk offsets it while it lasts.', 'info'); }, { hours: CREDIT_PARAMS.adoptToolHours, label: 'Adopt a vendor tool' }));
  on(root, 'click', '[data-plan]', (e, el) => {
    const [cid, choice] = el.dataset.plan.split(':');
    ctx.act((st) => { const r = planCliff(st, cid, choice); if (!r.ok) throw new Error(r.error); toast('Plan recorded.', 'good'); }, { hours: choice === 'rightsize' ? CREDIT_PARAMS.rightsizeHours : CREDIT_PARAMS.cliffPlanHours, label: 'Credit cliff plan' });
  });
  on(root, 'submit', '#cloudForm', (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const cl = perksSlice(ctx.state).cloud;
    const moving = f.provider !== cl.provider;
    const hours = moving ? switchingHours(ctx.state) : (cl.footprint === 'overbuilt' && f.footprint !== 'overbuilt' ? CLOUD.rightsizeHours : 1);
    ctx.act((st) => { if (moving) { const r = moveCloud(st, f.provider); if (!r.ok) throw new Error(r.error); } if (f.footprint !== perksSlice(st).cloud.footprint) setFootprint(st, f.footprint); }, { hours, label: moving ? 'Move hosting' : 'Right-size hosting' });
  });
}
export { mrr, requestCost, accountsOf, round2, totalBalance };

/** Money -> Stack audit: where the AI / LLM money goes (inference COGS, coding seats and API, evals), net of credits. */
export function aiSpendAudit(s) {
  const from = s.day - 90;
  const rows = {};
  for (const t of s.bank.txns) {
    if (t.day < from || t.amount > 0 && !t.meta?.gross) continue;
    const isAi = t.category === 'ai_inference' || t.meta?.app === 'aicost' || t.meta?.dev === true || /AI coding|Anthropic|OpenAI/i.test(t.counterparty ?? '');
    if (!isAi) continue;
    const k = `${t.counterparty}|${t.category}`;
    const r = (rows[k] ??= { vendor: t.counterparty, category: t.category, net: 0, gross: 0, credits: 0, n: 0 });
    r.net += -t.amount; r.gross += t.meta?.gross ?? -t.amount; r.credits += t.meta?.creditApplied ?? 0; r.n++;
  }
  const list = Object.values(rows).sort((a, b) => b.gross - a.gross);
  if (!list.length) return '';
  const tot = list.reduce((a, r) => a + r.net, 0);
  return html`<section class="panel"><h2>AI and LLM spend (last 90 days) <span class="badge">${usd(tot)} cash</span></h2>
    <div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Books as</th><th class="r">Gross</th><th class="r">Credits</th><th class="r">Cash</th></tr></thead><tbody>
    ${list.map((r) => html`<tr><td>${r.vendor}</td><td class="small">${r.category === 'ai_inference' ? 'COGS (inference)' : r.category}</td><td class="r">${usd(r.gross)}</td><td class="r">${r.credits ? usd(-r.credits) : '—'}</td><td class="r">${usd(r.net)}</td></tr>`)}
    </tbody></table></div>
    <p class="small muted">In-product inference is COGS and drives gross margin (<a href="#/product/aicosts">Product → AI costs</a>); coding seats and API are R&D software spend. Per-engineer AI spend of $200-600 is typical with a tail past $1,000 [secondary].</p></section>`;
}
