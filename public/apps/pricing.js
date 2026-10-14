// Pricing lab: pricing model & value metric, good-better-best tier designer (writes state.plans), annual
// discount, trial vs freemium vs reverse trial, pricing-page preview, price research (Van Westendorp and
// Gabor-Granger on an LLM customer panel or a real in-game customer survey), A/B price tests on new signups
// with a significance test, a price-increase workflow for existing customers, and sales discount guardrails.
// Research: PRICING_RESEARCH (public/data/channels.js), docs/research/channels-partnerships-pricing.md §3.

import { html, mount, on, formData, table, stat, badge, lineChart } from '../core/ui.js';
import { money, pct, fmtDate, uid } from '../core/util.js';
import { REALISM } from '../core/llm.js';
import { activeSubs, trialingSubs } from '../core/stripe.js';
import { mainPlan, ensureMarket, trialConversion, cfg, shippedFeatures } from '../core/market.js';
import { PRICING_RESEARCH } from '../data/channels.js';
import { pricingSlice, PRICING_MODELS, VALUE_METRICS, TRIAL_MODES, trialModeEffects, modelEffects, defaultTiers, tierValues, monthlyOf, modeFromMarket, discountCheck, DISCOUNT_BANDS, maxDiscount } from './channels/pricing-model.js';
import { applyPricingModel, applyTrialMode, publishTiers, predictedMix, startAbTest, stopAbTest, abResults, scheduleIncrease, sendCustomerSurvey, heuristicRespondents, pricingDay, pricingMonthEnd } from './channels/pricing-sim.js';
import { vanWestendorp, gaborGranger, priceIncreaseChurn, priceIncreaseOutlook, sampleSizePerArm } from './channels/stats.js';
import { css, judgeBox, currentJudged, wireJudgeHelper, designTag } from './channels/ui-common.js';

const PR = PRICING_RESEARCH;
const hasAi = (state) => shippedFeatures(state).some((f) => f.ai?.enabled);

// ---------------------------------------------------------------------------------------------------------
// Model & value metric
// ---------------------------------------------------------------------------------------------------------

let creditCalc = { price: 49, credits: 500, costPerCredit: 0.02, usage: 0.6 };
const modelTab = {
  id: 'model', label: 'Model',
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s);
    const eff = modelEffects(P.model, { bizModel: s.company.model, hasAi: hasAi(s) });
    const cc = creditCalc;
    const cost = cc.credits * cc.usage * cc.costPerCredit;
    return html`<section class="panel"><h2>Pricing model</h2>
      <p class="small muted">Kyle Poyar's 2025 State of B2B Monetization (240 companies): hybrid 27% → 41%, flat 29% → 22%, seat-based 21% → 15%, outcome-based 5% (25% expect it by 2028); three in four changed pricing in the last year.</p>
      <form id="modelForm"><div class="ch-cards">${PRICING_MODELS.map((m) => html`<label class="card radio-card" style="display:block;margin:0"><input type="radio" name="model" value="${m.id}" ${P.model === m.id ? 'checked' : ''} style="width:auto;display:inline-block"/> <b>${m.label}</b>
        <div class="small">${m.shareOfCompanies2025 ? `${pct(m.shareOfCompanies2025[0], 0)} of B2B companies (2025)` : ''} · ${m.trend}</div>
        <div class="small muted">Best for: ${m.bestFor}</div><div class="small muted">Risks: ${m.risks.join('; ')}</div>
        ${m.examples ? html`<div class="small muted">e.g. ${m.examples[0]}</div>` : ''}</label>`)}</div>
        <label>Value metric (the unit that grows with customer value and that they can predict) <input name="metric" list="metrics" value="${P.valueMetric}" placeholder="e.g. contacts managed, AI resolutions"/><datalist id="metrics">${VALUE_METRICS[s.company.model].map((v) => html`<option value="${v}"></option>`)}</datalist></label>
        <button class="primary">Apply model (1h)</button></form>
      ${eff.warnings.length ? html`${eff.warnings.map((w) => html`<div class="callout warn small">${w}</div>`)}` : ''}
      <p class="small muted">Effects in the simulation ${designTag}: monthly expansion ${pct(eff.expansion, 1)} / contraction ${pct(eff.contraction, 1)} of monthly subscriptions (seats/usage units), conversion ×${eff.conv.toFixed(2)}, churn ×${eff.churn.toFixed(2)}.</p></section>
    <section class="panel"><h2>AI credits margin check</h2>
      <p class="small muted">Reference prices: Salesforce Agentforce Flex Credits $0.10/action; Intercom Fin $0.99/resolution; GitHub Copilot $0.04 per extra premium request. Cost/margin was the #1 factor in AI pricing decisions (2025).</p>
      <form id="creditForm" class="grid-4"><label>Plan price ($/mo)<input type="number" name="price" value="${cc.price}" step="1"/></label><label>Included credits<input type="number" name="credits" value="${cc.credits}"/></label><label>Your cost per credit ($)<input type="number" name="costPerCredit" value="${cc.costPerCredit}" step="0.001"/></label><label>Avg share used<input type="number" name="usage" value="${cc.usage}" step="0.05" min="0" max="1.5"/></label></form>
      <p>Inference cost per customer: <b>${money(cost, { cents: true })}/mo</b> → gross margin on this plan <b class="${cc.price - cost < 0.6 * cc.price ? 'warn' : 'pos'}">${pct((cc.price - cost) / Math.max(0.01, cc.price), 0)}</b>. A power user at 3× average usage costs ${money(cost * 3, { cents: true })}.</p></section>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#modelForm', (e) => { e.preventDefault(); const f = formData(e.target); ctx.act((st) => applyPricingModel(st, f.model, f.metric), { hours: 1, label: 'Pricing model' }); });
    on(root, 'change', '#creditForm', (e, el) => { const f = formData(el); creditCalc = { price: f.price ?? 0, credits: f.credits ?? 0, costPerCredit: f.costPerCredit ?? 0, usage: f.usage ?? 0 }; ctx.render(); });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Tiers & pricing page
// ---------------------------------------------------------------------------------------------------------

let tierDraft = null, annualDraft = null, previewAnnual = false;
const tiersTab = {
  id: 'tiers', label: 'Tiers & page',
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s);
    tierDraft ??= (P.tiers ?? defaultTiers(s)).map((t) => ({ ...t, features: [...(t.features ?? [])] }));
    annualDraft ??= P.annualDiscount ?? (s.company.model === 'ent' ? null : 0.167);
    const base = mainPlan(s);
    const interval = s.company.model === 'ent' ? base.interval : 'month';
    const wtp = ensureMarket(s).fit.price.wtp ?? cfg(s).refPrice;
    const values = tierValues(tierDraft);
    const mix = predictedMix({ ...s, apps: { ...s.apps, pricing: { ...P, tiers: tierDraft, annualDiscount: annualDraft } } });
    const arpa = mix ? mix.tiers.reduce((a, t, i) => a + mix.shares[i] * (interval === 'year' ? t.price / 12 : t.price), 0) : 0;
    void values;
    return html`<section class="panel"><h2>Good · better · best</h2>
      <p class="small muted">2–4 tiers plus "Enterprise: contact us" is standard. A 50–70% middle-tier share is a practitioner target, not a measured benchmark; the decoy/compromise effect is documented in lab studies. Companies under ~$5k ACV with PLG usually publish prices. Prices are per ${interval}.</p>
      <div id="tierRows">${tierDraft.map((t, i) => html`<div class="tier-row" data-i="${i}">
        <label>Name<input data-f="name" value="${t.name}"/></label>
        <label>Price ($/${interval === 'year' ? 'yr' : 'mo'})<input type="number" data-f="price" value="${t.price}" min="0" step="1"/></label>
        <label>Features (comma-separated)<input data-f="features" value="${(t.features ?? []).join(', ')}"/></label>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px"><label style="margin:0;display:flex;gap:4px;align-items:center"><input type="radio" name="hl" data-hl="${i}" ${t.highlight ? 'checked' : ''} style="width:auto;display:inline-block"/> Most popular</label>${tierDraft.length > 1 ? html`<button class="sm danger" data-rm="${i}">✕</button>` : ''}</div>
      </div>`)}</div>
      ${tierDraft.length < 4 ? html`<button class="sm" id="addTier">+ Add tier</button>` : ''}
      ${interval === 'month' ? html`<label>Annual discount (%) <input type="number" id="annualDisc" min="0" max="40" step="0.1" value="${annualDraft != null ? +(annualDraft * 100).toFixed(1) : 0}"/><span class="hint">Most common 16.7% (two months free), typical 15–20% (Recurly); Clay gives only 10%. 0 = no annual plans.</span></label>` : ''}
      <h3>Predicted mix ${designTag}</h3>
      ${mix ? html`<p class="small">${mix.tiers.map((t, i) => `${t.name} ${pct(mix.shares[i], 0)}`).join(' · ')}${mix.annual ? ` · ${pct(mix.annual, 0)} choose annual` : ''} · market willingness to pay ~${money(wtp)}/mo · blended ARPA ~${money(arpa)}/mo</p>` : ''}
      <button class="primary" id="publish">Publish pricing (1.5h)</button> <button id="resetTiers">Reset draft</button>
      ${P.publishedDay != null ? html`<span class="small muted"> Last published ${fmtDate(s, P.publishedDay)}. Existing subscribers keep their price (archived plans stay attached).</span>` : ''}
    </section>
    <section class="panel"><div class="inline" style="justify-content:space-between"><h2>Pricing page preview</h2>${interval === 'month' && annualDraft ? html`<label style="flex:0 0 auto;display:flex;gap:6px;align-items:center"><input type="checkbox" id="pvAnnual" style="width:auto;display:inline-block" ${previewAnnual ? 'checked' : ''}/> Billed annually (save ${Math.round(annualDraft * 100)}%)</label>` : ''}</div>
      <div class="price-page">${tierDraft.map((t) => {
        const shown = previewAnnual && annualDraft ? (t.price * (1 - annualDraft)) : t.price;
        return html`<div class="price-card ${t.highlight ? 'hl' : ''}">${t.highlight ? badge('Most popular', 'accent') : ''}<h3 style="margin-top:6px">${t.name}</h3>
          <div class="amt">${money(shown, { cents: shown < 100 && shown % 1 !== 0 })}<span class="small muted">/${interval === 'year' ? 'yr' : 'mo'}</span></div>
          ${previewAnnual && annualDraft ? html`<div class="small muted">billed ${money(t.price * 12 * (1 - annualDraft))} yearly</div>` : ''}
          <ul>${(t.features ?? []).filter(Boolean).map((f) => html`<li>${f}</li>`)}</ul>
          <button class="${t.highlight ? 'primary' : ''}" disabled>${(ensureMarket(s).cardRequired ? 'Start trial' : base.trialDays ? 'Start free trial' : 'Talk to sales')}</button></div>`;
      })}${s.company.model !== 'b2c' ? html`<div class="price-card"><h3>Enterprise</h3><div class="amt">Custom</div><ul><li>Security review, SSO, DPA</li><li>Volume pricing</li></ul><button disabled>Contact sales</button></div>` : ''}</div></section>`;
  },
  wire(root, ctx) {
    on(root, 'input', '[data-f]', (e, el) => {
      const i = +el.closest('[data-i]').dataset.i, f = el.dataset.f;
      tierDraft[i][f] = f === 'price' ? Number(el.value) : f === 'features' ? el.value.split(',').map((x) => x.trim()).filter(Boolean) : el.value;
    });
    on(root, 'change', '[data-f="price"],[data-f="features"]', () => ctx.render());
    on(root, 'change', '[data-hl]', (e, el) => { tierDraft.forEach((t, i) => { t.highlight = i === +el.dataset.hl; }); ctx.render(); });
    on(root, 'click', '[data-rm]', (e, el) => { tierDraft.splice(+el.dataset.rm, 1); if (!tierDraft.some((t) => t.highlight)) tierDraft[0].highlight = true; ctx.render(); });
    on(root, 'click', '#addTier', () => { const last = tierDraft.at(-1); tierDraft.push({ key: uid('t').slice(-6), name: 'New tier', price: Math.round((last?.price ?? 20) * 2), features: [], highlight: false }); ctx.render(); });
    on(root, 'change', '#annualDisc', (e) => { const v = +e.target.value; annualDraft = v > 0 ? v / 100 : null; ctx.render(); });
    on(root, 'change', '#pvAnnual', (e) => { previewAnnual = e.target.checked; ctx.render(); });
    on(root, 'click', '#resetTiers', () => { tierDraft = null; annualDraft = null; ctx.render(); });
    on(root, 'click', '#publish', () => {
      const tiers = tierDraft.map((t, i) => ({ ...t, key: t.key || `t${i}` }));
      if (new Set(tiers.map((t) => t.key)).size !== tiers.length) tiers.forEach((t, i) => { t.key = `${t.key}${i}`; });
      ctx.act((st) => { publishTiers(st, tiers, { annualDiscount: annualDraft }); ctx.toast('Pricing published. New checkouts pick tiers by the predicted mix.', 'good'); }, { hours: 1.5, label: 'Pricing page & plans' });
    });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Signup model: trial vs freemium vs reverse trial vs card required
// ---------------------------------------------------------------------------------------------------------

const signupTab = {
  id: 'signup', label: 'Trial & freemium',
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s);
    const current = P.trialMode ?? modeFromMarket(ensureMarket(s), mainPlan(s));
    const fp = PR.benchmarks.freeToPaid;
    return html`<section class="panel"><h2>How people start</h2>
      <p class="small muted">ChartMogul × Kyle Poyar (200 B2B products, 2026-01): median free→paid ${pct(fp.medianAllModels, 0)}, bimodal; card-required trials ~25–35%; ${fp.commonTrialLength}. ${fp.note}.</p>
      <form id="modeForm">${Object.entries(TRIAL_MODES).filter(([k]) => s.company.model === 'ent' || k !== 'demo_only' || true).map(([k, m]) => { const e = trialModeEffects(k, s.company.model); return html`<label class="radio-card"><input type="radio" name="mode" value="${k}" ${current === k ? 'checked' : ''}/><b>${m.label}</b><span>${m.research}. In the game ${designTag}: signups ×${e.landing}, conversion ×${e.conv}${e.cardRequired ? ', card required (core trial conversion is higher)' : ''}, ${e.trialDays ? `${e.trialDays}-day window` : 'no trial'}.</span></label>`; })}
        <button class="primary">Apply (1h)</button></form>
      <p class="small muted">This sets the card requirement (shared with Customers → Onboarding) and the trial length on your active plans. ${s.company.model === 'b2c' ? 'B2C apps: hard paywall with a trial converts download→paid ~10.7% vs freemium ~2.1% (RevenueCat via marketing research).' : ''} Free users of AI features cost real inference money.</p></section>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#modeForm', (e) => { e.preventDefault(); const m = formData(e.target).mode; if (m) ctx.act((st) => applyTrialMode(st, m), { hours: 1, label: 'Signup model' }); });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Price research: Van Westendorp & Gabor-Granger (LLM panel or customer survey)
// ---------------------------------------------------------------------------------------------------------

const VW_SCHEMA = { type: 'object', additionalProperties: false, required: ['respondents'], properties: { respondents: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['persona', 'tooCheap', 'cheap', 'expensive', 'tooExpensive'], properties: { persona: { type: 'string' }, tooCheap: { type: 'number' }, cheap: { type: 'number' }, expensive: { type: 'number' }, tooExpensive: { type: 'number' } } } } } };
const GG_SCHEMA = { type: 'object', additionalProperties: false, required: ['respondents'], properties: { respondents: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['persona', 'likelihoods'], properties: { persona: { type: 'string' }, likelihoods: { type: 'array', items: { type: 'number' } } } } } } };

function productBrief(s) {
  const feats = shippedFeatures(s).map((f) => f.title).slice(0, 8);
  return `Product: ${s.company.name} — ${s.company.oneLiner || '(no one-liner)'}\nTarget customer: ${s.company.icp || 'not specified'}\nShipped features: ${feats.length ? feats.join('; ') : 'none yet (pre-product)'}\nBusiness model: ${s.company.model === 'b2c' ? 'consumer app subscription' : s.company.model === 'smb' ? 'B2B SaaS for small businesses' : 'B2B mid-market/enterprise SaaS'}`;
}
export const ggPrices = (s) => { const p = monthlyOf(mainPlan(s)); return [0.5, 0.75, 1, 1.5, 2].map((m) => Math.max(1, Math.round(p * m))); };

async function runLlmSurvey(ctx, method) {
  const s = ctx.state;
  const prices = ggPrices(s);
  const per = 6;
  const res = await ctx.llm.panel({
    task: `pricing_${method}`,
    system: `${REALISM}\nYou simulate a pricing survey panel for market research in 2026. Role-play ${per} DISTINCT people who match the target customer, with different budgets, company sizes and urgency — include at least one who would not buy at all. Answer as they would in a survey (stated, not revealed, preferences). Amounts in USD per month.`,
    prompt: `${productBrief(s)}\n\n${method === 'vw'
      ? 'For each respondent answer the four Van Westendorp questions: at what monthly price would it be so cheap you doubt its quality (tooCheap); a bargain (cheap); getting expensive but still worth considering (expensive); too expensive to consider (tooExpensive). tooCheap < cheap < expensive < tooExpensive.'
      : `For each respondent give the likelihood (0–1) they would buy at each monthly price, in this order: ${prices.map((p) => `$${p}`).join(', ')}.`}\nDo not assume any current price.`,
    schema: method === 'vw' ? VW_SCHEMA : GG_SCHEMA,
    temperature: 0.9,
    maxTokens: 1400,
    fallback: () => ({ respondents: heuristicRespondents(s, { method, prices, count: per, salt: String(pricingSlice(s).surveys.length) }) }),
  });
  const responses = res.flatMap((r) => (r.data?.respondents ?? []).map((x) => (method === 'vw' ? { tooCheap: +x.tooCheap, cheap: +x.cheap, expensive: +x.expensive, tooExpensive: +x.tooExpensive, persona: x.persona, model: r.model } : { ...Object.fromEntries(prices.map((p, i) => [p, +(x.likelihoods?.[i] ?? 0)])), persona: x.persona, model: r.model })));
  return { responses, mock: res.every((r) => r.mock), prices };
}

const researchTab = {
  id: 'research', label: 'Price research',
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s);
    const latest = P.surveys.filter((x) => x.status === 'done').slice(0, 6);
    return html`<section class="panel"><h2>Willingness-to-pay research</h2>
      <div class="callout warn"><b>An LLM panel is not your customers.</b> AI respondents give stated (not revealed) willingness to pay, are anchored on whatever prices they absorbed in training, and have no budget authority. Use them to rehearse and to spot an absurd price — not as evidence. Practitioner rules of thumb: Van Westendorp 200–400 respondents, conjoint 300–600; at seed stage prefer sequential cohort tests and 10–20 WTP conversations.</div>
      <div class="grid-2">
        <div class="card"><b>AI customer panel</b> <span class="small muted">(Claude Haiku 5.5 + Jev, ~12 respondents, instant)</span><br>
          <button data-llm="vw">Van Westendorp (1h)</button> <button data-llm="gg">Gabor-Granger (1h)</button></div>
        <div class="card"><b>Survey your paying customers</b> <span class="small muted">(${activeSubs(s).length} customers, ~10–20% answer within a week ${designTag}; they already accepted your price, so answers skew high)</span><br>
          <button data-cust="vw">Van Westendorp (0.75h)</button> <button data-cust="gg">Gabor-Granger (0.75h)</button></div>
      </div>
      ${P.surveys.filter((x) => x.status === 'collecting').map((x) => html`<p class="small">Customer survey collecting answers until ${fmtDate(s, x.readyDay)}…</p>`)}
    </section>
    ${latest.map((sv, i) => surveyView(s, sv, i))}`;
  },
  wire(root, ctx) {
    on(root, 'click', '[data-llm]', (e, el) => {
      el.disabled = true; el.textContent = 'Panel answering…';
      const method = el.dataset.llm;
      ctx.act(async (st) => {
        const r = await runLlmSurvey(ctx, method);
        pricingSlice(st).surveys.unshift({ id: uid('sv'), source: 'llm', method, day: st.day, status: 'done', responses: r.responses, prices: r.prices, mock: r.mock });
      }, { hours: 1, label: 'Pricing survey design' });
    });
    on(root, 'click', '[data-cust]', (e, el) => ctx.act((st) => { const sv = sendCustomerSurvey(st, el.dataset.cust); sv.prices = ggPrices(st); ctx.toast('Survey sent. Results in a week.', 'info'); }, { hours: 0.75, label: 'Customer pricing survey' }));
    // Draw Van Westendorp charts.
    for (const cv of root.querySelectorAll('canvas[data-vw]')) {
      const sv = pricingSlice(ctx.state).surveys.find((x) => x.id === cv.dataset.vw);
      const vw = sv && vanWestendorp(sv.responses);
      if (vw) lineChart(cv, [{ values: vw.tooCheap, color: '--warn' }, { values: vw.cheap, color: '--good' }, { values: vw.expensive, color: '--accent' }, { values: vw.tooExpensive, color: '--bad' }], { format: (v) => pct(v, 0), labels: [money(vw.grid[0]), money(vw.grid.at(-1))], height: 150 });
    }
  },
};

function surveyView(s, sv, i) {
  const price = monthlyOf(mainPlan(s));
  const head = html`<h2>${sv.method === 'vw' ? 'Van Westendorp' : 'Gabor-Granger'} · ${sv.source === 'llm' ? 'AI panel' : 'paying customers'} · ${fmtDate(s, sv.day)} ${sv.mock ? badge('offline heuristic', '') : sv.source === 'llm' ? badge('LLM', 'accent') : badge('in-game customers', 'good')}</h2>
    <p class="small ${sv.responses.length < 200 ? 'warn' : ''}">n = ${sv.responses.length}${sv.responses.length < 200 ? ` — far below the 200–400 practitioners recommend; ranges are very noisy` : ''}.</p>`;
  if (sv.method === 'vw') {
    const vw = vanWestendorp(sv.responses);
    if (!vw) return html`<section class="panel">${head}<p class="empty">Not enough valid answers.</p></section>`;
    return html`<section class="panel">${head}
      <div class="stats">${stat('Point of marginal cheapness', money(vw.pmc))}${stat('Optimal price point', money(vw.opp))}${stat('Indifference price point', money(vw.ipp))}${stat('Point of marginal expensiveness', money(vw.pme))}</div>
      <p class="small">Acceptable range ${money(vw.pmc)}–${money(vw.pme)} per month. Your current price ${money(price)} is ${vw.pmc != null && price < vw.pmc ? html`<b class="warn">below</b> the range` : vw.pme != null && price > vw.pme ? html`<b class="warn">above</b> the range` : 'inside the range'}.</p>
      ${i < 3 ? html`<canvas data-vw="${sv.id}" style="width:100%"></canvas><p class="small muted">Curves: too cheap (amber), bargain (green), expensive (accent), too expensive (red).</p>` : ''}</section>`;
  }
  const gg = gaborGranger(sv.responses, sv.prices ?? []);
  if (!gg) return html`<section class="panel">${head}<p class="empty">No answers.</p></section>`;
  return html`<section class="panel">${head}
    ${table({ columns: [{ key: 'price', label: 'Price/mo', render: (p) => money(p.price) }, { key: 'stated', label: 'Stated likelihood', align: 'right', render: (p) => pct(p.stated, 0) }, { key: 'demand', label: 'Calibrated demand', align: 'right', render: (p) => pct(p.demand, 1) }, { key: 'revenue', label: 'Revenue index', align: 'right', render: (p) => html`${p === gg.best ? badge('max', 'good') : ''} ${p.revenue.toFixed(2)}` }], rows: gg.points })}
    <p class="small muted">Stated purchase intent overstates real buying; demand is calibrated at ×0.35 ${designTag}. Order effects and hypothetical bias apply.</p></section>`;
}

// ---------------------------------------------------------------------------------------------------------
// A/B price test
// ---------------------------------------------------------------------------------------------------------

const abTab = {
  id: 'ab', label: 'A/B test',
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s);
    const plan = mainPlan(s);
    const running = P.abTests.find((t) => t.status === 'running');
    const tc = trialConversion(s, plan);
    const weekTrials = (s.stripe?.subscriptions ?? []).filter((x) => x.startDay > s.day - 28 && x.trialEndDay != null).length / 4;
    const need = sampleSizePerArm(Math.max(0.01, tc), 0.2);
    const weeks = weekTrials > 0 ? (need * 2) / weekTrials : Infinity;
    return html`<section class="panel"><h2>Price test on new signups</h2>
      <p class="small muted">New trials on <b>${plan.name}</b> are split 50/50 at checkout: half see ${money(plan.price)}, half see the test price. A price test needs hundreds of conversions per arm to detect a 20% difference; below ~100 paid conversions a month, sequential cohort tests (change the price for everyone for 4–8 weeks) plus WTP conversations are usually better ${designTag}.</p>
      <p class="small">At your current trial→paid rate (~${pct(tc, 1)}) you need ~<b>${Number.isFinite(need) ? need.toLocaleString() : '∞'}</b> decided trials per arm to detect a ±20% conversion change (80% power, α = 0.05). At ${weekTrials.toFixed(1)} new trials/week that's ~${Number.isFinite(weeks) ? `${Math.ceil(weeks)} weeks` : 'forever'}.</p>
      ${running ? '' : html`<form id="abForm" class="inline"><label>Test price ($/${plan.interval === 'year' ? 'yr' : 'mo'}) <input type="number" name="price" min="1" step="1" value="${Math.round(plan.price * 1.3)}"/></label><button class="primary" ${plan.trialDays > 0 ? '' : 'disabled'}>Start test (1h)</button></form>${plan.trialDays > 0 ? '' : html`<p class="small warn">Your default plan has no trial: price tests here randomize trial checkouts.</p>`}`}
    </section>
    ${P.abTests.slice(0, 4).map((t) => abView(s, t))}`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#abForm', (e) => { e.preventDefault(); const p = formData(e.target).price; ctx.act((st) => startAbTest(st, { variantMult: p / mainPlan(st).price }), { hours: 1, label: 'Price test setup' }); });
    on(root, 'click', '[data-stop]', (e, el) => ctx.act((st) => stopAbTest(st, el.dataset.stop, { adopt: el.dataset.adopt === '1' }), { hours: 0.25, label: 'Price test decision' }));
  },
};

function abView(s, t) {
  const r = abResults(s, t);
  const sig = r.test.significant;
  return html`<section class="panel"><h2>${money(t.controlPrice)} vs ${money(t.variantPrice)} · ${t.status === 'running' ? badge('running', 'warn') : badge(t.adopted ? 'adopted' : 'stopped', '')} <span class="small muted">since ${fmtDate(s, t.startDay)}</span></h2>
    ${table({ columns: [{ key: 'arm', label: 'Arm' }, { key: 'trials', label: 'Trials', align: 'right' }, { key: 'decided', label: 'Decided', align: 'right' }, { key: 'won', label: 'Paid', align: 'right' }, { key: 'rate', label: 'Conversion', align: 'right' }, { key: 'val', label: 'Value / decided trial', align: 'right' }],
      rows: [{ arm: `A · ${money(t.controlPrice)}`, ...r.A, rate: r.test.pA != null ? pct(r.test.pA, 1) : '—', val: r.valueA != null ? money(r.valueA, { cents: true }) : '—' }, { arm: `B · ${money(t.variantPrice)}`, ...r.B, rate: r.test.pB != null ? pct(r.test.pB, 1) : '—', val: r.valueB != null ? money(r.valueB, { cents: true }) : '—' }] })}
    <p class="small">Two-proportion z-test on conversion: z = ${r.test.z.toFixed(2)}, p = ${r.test.p.toFixed(3)}${r.test.ci95[0] != null ? `, 95% CI of the difference ${pct(r.test.ci95[0], 1)} to ${pct(r.test.ci95[1], 1)}` : ''} → ${sig ? html`<b class="pos">significant</b>` : html`<b class="warn">not significant</b>${!r.test.enough ? ' (too few conversions for the test to be valid)' : ''}`}. Revenue per decided trial (Welch): p = ${r.revTest.p.toFixed(3)}${r.revTest.enough ? '' : ' (n < 30 per arm)'}.</p>
    <p class="small muted">Need ~${Number.isFinite(r.needed20) ? r.needed20 : '∞'} decided trials per arm to detect ±20%. Don't stop the moment p dips below 0.05 — peeking inflates false positives. Customers comparing notes and fairness are real risks of live price tests.</p>
    ${t.status === 'running' ? html`<button data-stop="${t.id}" data-adopt="0">Stop, keep ${money(t.controlPrice)}</button> <button class="primary" data-stop="${t.id}" data-adopt="1">Stop, adopt ${money(t.variantPrice)}</button>` : ''}</section>`;
}

// ---------------------------------------------------------------------------------------------------------
// Price increase for existing customers
// ---------------------------------------------------------------------------------------------------------

let incForm = null;
const increaseTab = {
  id: 'increase', label: 'Price increase',
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s);
    const plans = s.plans.filter((p) => (s.stripe?.subscriptions ?? []).some((x) => x.planId === p.id && x.status !== 'canceled'));
    incForm ??= { planId: plans[0]?.id ?? mainPlan(s).id, newPrice: Math.round(mainPlan(s).price * 1.2), noticeDays: 30, grandfather: 0, lockIn: true, valueAdded: false, alsoNew: true };
    const plan = s.plans.find((p) => p.id === incForm.planId) ?? mainPlan(s);
    const subs = (s.stripe?.subscriptions ?? []).filter((x) => x.planId === plan.id && ['active', 'past_due', 'trialing'].includes(x.status));
    const j = currentJudged(s, 'price_notice');
    const inc = incForm.newPrice / plan.price - 1;
    const pChurn = priceIncreaseChurn({ model: s.company.model, increasePct: inc, comms: j?.quality ?? 0.4, noticeDays: incForm.noticeDays, grandfathered: incForm.grandfather > 0, lockInOffered: incForm.lockIn, valueAdded: incForm.valueAdded });
    const out = priceIncreaseOutlook({ customers: subs.length, oldPrice: plan.price, newPrice: incForm.newPrice, churnProb: pChurn, baseMonthlyChurn: s.company.model === 'ent' ? 0.01 : s.company.model === 'smb' ? 0.03 : 0.08, grandfatherMonths: incForm.grandfather });
    return html`<section class="panel"><h2>Raise prices for existing customers</h2>
      <p class="small muted">SaaS renewal prices rose ~12.3% YoY (Vertice, 2025-09); median list increase ~7.8% (Zylo 2026). Practice: test on new customers first, give 30–90 days' notice, grandfather 6–12 months, tie it to added value, offer an annual lock-in at the old price. Anecdotes: $49 → $79 with grandfathering → 3.2% churn, +47% net revenue (practitioner); Cursor's unclear 2025 change → public apology and refunds within 3 weeks.</p>
      <form id="incForm" class="grid-3">
        <label>Plan <select name="planId">${(plans.length ? plans : [mainPlan(s)]).map((p) => html`<option value="${p.id}" ${p.id === plan.id ? 'selected' : ''}>${p.name} — ${money(p.price)}/${p.interval === 'year' ? 'yr' : 'mo'}${p.active ? '' : ' (archived)'}</option>`)}</select></label>
        <label>New price <input type="number" name="newPrice" min="1" step="1" value="${incForm.newPrice}"/><span class="hint">${pct(inc, 0)} increase</span></label>
        <label>Notice <select name="noticeDays">${[0, 14, 30, 60, 90].map((d) => html`<option value="${d}" ${incForm.noticeDays === d ? 'selected' : ''}>${d ? `${d} days` : 'None (effective now)'}</option>`)}</select></label>
        <label>Grandfather existing customers <select name="grandfather">${[[0, 'No'], [6, '6 months'], [12, '12 months']].map(([v, l]) => html`<option value="${v}" ${incForm.grandfather === v ? 'selected' : ''}>${l}</option>`)}</select></label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="lockIn" style="width:auto;display:inline-block" ${incForm.lockIn ? 'checked' : ''}/> Offer annual lock-in at the old price</label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="valueAdded" style="width:auto;display:inline-block" ${incForm.valueAdded ? 'checked' : ''}/> Tied to features shipped since they signed up</label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="alsoNew" style="width:auto;display:inline-block" ${incForm.alsoNew ? 'checked' : ''}/> Also raise the list price for new customers now</label>
      </form>
      ${judgeBox(s, 'price_notice', { label: 'Notice email to customers', hours: 1, rows: 8, placeholder: 'Subject\n\nWhat changes, from when, why (what you added / costs), what it means for them, how to keep the old price (annual), who to reply to…' })}
      <div class="stats">${stat('Customers affected', subs.length)}${stat('Expected cancellations', `${(subs.length * pChurn).toFixed(1)} (${pct(pChurn, 1)})`, html`k × increase% ${designTag}`)}${stat('12-month revenue on this base', `${out.netChange >= 0 ? '+' : ''}${pct(out.netChange, 0)}`, 'vs not raising')}</div>
      <button class="primary" id="incGo" ${subs.length ? '' : 'disabled'}>Send notice & schedule (0.5h)</button>
    </section>
    <section class="panel"><h2>History</h2>${table({ columns: [
      { key: 'announcedDay', label: 'Announced', render: (x) => fmtDate(s, x.announcedDay) }, { key: 'planName', label: 'Plan' },
      { key: 'chg', label: 'Change', render: (x) => `${money(x.oldPrice)} → ${money(x.newPrice)} (${pct(x.increasePct, 0)})` },
      { key: 'status', label: 'Status', render: (x) => badge(x.status, x.status === 'done' ? 'good' : 'warn') },
      { key: 'migrated', label: 'Migrated', align: 'right' }, { key: 'lockedIn', label: 'Locked in', align: 'right' }, { key: 'churned', label: 'Cancelling', align: 'right' },
    ], rows: P.increases, empty: 'No price increases yet.' })}</section>`;
  },
  wire(root, ctx) {
    on(root, 'change', '#incForm', (e, el) => { const f = formData(el); incForm = { planId: f.planId, newPrice: f.newPrice ?? 0, noticeDays: +f.noticeDays, grandfather: +f.grandfather, lockIn: f.lockIn, valueAdded: f.valueAdded, alsoNew: f.alsoNew }; ctx.render(); });
    on(root, 'click', '#incGo', () => {
      const j = currentJudged(ctx.state, 'price_notice');
      if (!j && !confirm('Send without a reviewed notice email? Bad communication roughly doubles the churn spike.')) return;
      ctx.act((st) => { const x = scheduleIncrease(st, { planId: incForm.planId, newPrice: incForm.newPrice, noticeDays: incForm.noticeDays, grandfatherMonths: incForm.grandfather, lockIn: incForm.lockIn, valueAdded: incForm.valueAdded, comms: j ?? { quality: 0.2 }, alsoNewCustomers: incForm.alsoNew }); ctx.toast(`Notice sent to ${x.targets.length} customers.`, 'info'); }, { hours: 0.5, label: 'Price increase' });
    });
    wireJudgeHelper(root, ctx, { price_notice: ['price_notice', 1, 50] });
  },
};

// ---------------------------------------------------------------------------------------------------------
// Discount guardrails
// ---------------------------------------------------------------------------------------------------------

const discountTab = {
  id: 'discounts', label: 'Discounts', models: ['smb', 'ent'],
  render(ctx) {
    const s = ctx.state, P = pricingSlice(s), pol = P.discountPolicy;
    const deals = (s.apps.crm?.deals ?? []).filter((d) => d.amount > 0).slice(-40).reverse();
    const won = deals.filter((d) => d.stage === 'won');
    const avg = won.length ? won.reduce((a, d) => a + (d.discountPct ?? 0), 0) / won.length : null;
    return html`<section class="panel"><h2>Sales discount guardrails</h2>
      <p class="small muted">Vendr buyer data: average negotiated discount ~10% and falling since 2022; Vertice: ~34% off list on average (ERP/AI ~45%) — different methods. Bands by ACV below are game estimates interpolated from those ${designTag}. Larger discounts should buy something: multi-year term (10–25%), prepayment, a case study. End of quarter adds 5–10 pp discount pressure ${designTag}.</p>
      <form id="discForm">${table({ columns: [{ key: 'label', label: 'Segment' }, { key: 'range', label: 'Typical', render: (b) => `${pct(b.range[0], 0)}–${pct(b.range[1], 0)}` }, { key: 'max', label: 'Your max', render: (b) => html`<input type="number" name="max_${b.id}" min="0" max="50" step="1" value="${Math.round((pol.overrides[b.id] ?? b.range[1]) * 100)}" style="max-width:90px"/>` }], rows: DISCOUNT_BANDS })}
        <div class="grid-2"><label>Founder approval needed above (%) <input type="number" name="approval" min="0" max="50" value="${pol.approvalAbove != null ? Math.round(pol.approvalAbove * 100) : ''}" placeholder="none"/></label>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="eoq" style="width:auto;display:inline-block" ${pol.endOfQuarter !== false ? 'checked' : ''}/> Allow +5 pp in the last two weeks of a quarter</label></div>
        <button class="primary">Save policy (0.5h)</button></form>
      <p class="small muted">The CRM can read these limits via <code>maxDiscount(state, acv)</code>. Today: a $20k ACV deal may get up to ${pct(maxDiscount(s, 20000), 0)}.</p></section>
    <section class="panel"><h2>Deals in your CRM</h2>${s.apps.crm ? table({ columns: [
      { key: 'name', label: 'Deal' }, { key: 'stage', label: 'Stage' }, { key: 'amount', label: 'ACV', align: 'right', render: (d) => money(d.amount) },
      { key: 'disc', label: 'Discount', align: 'right', render: (d) => pct(d.discountPct ?? 0, 0) },
      { key: 'chk', label: 'Guardrail', render: (d) => { const c = discountCheck(s, d.amount / Math.max(0.01, 1 - (d.discountPct ?? 0)), d.discountPct ?? 0); return c.ok ? badge(c.needsApproval ? 'needs approval' : 'ok', c.needsApproval ? 'warn' : 'good') : badge(`over ${pct(c.max, 0)} max`, 'bad'); } },
    ], rows: deals, empty: 'No deals with an amount yet.' }) : html`<p class="empty">No CRM yet.</p>`}
    ${avg != null ? html`<p class="small">Average discount on won deals: <b>${pct(avg, 1)}</b> (Vendr average ~10%).</p>` : ''}</section>`;
  },
  wire(root, ctx) {
    on(root, 'submit', '#discForm', (e) => {
      e.preventDefault();
      const f = formData(e.target);
      ctx.act((st) => {
        const pol = pricingSlice(st).discountPolicy;
        for (const b of DISCOUNT_BANDS) { const v = f[`max_${b.id}`]; if (v != null) pol.overrides[b.id] = Math.max(0, Math.min(50, v)) / 100; }
        pol.approvalAbove = f.approval == null ? null : f.approval / 100;
        pol.endOfQuarter = f.eoq;
      }, { hours: 0.5, label: 'Discount policy' });
    });
  },
};

const TABS = [modelTab, tiersTab, signupTab, researchTab, abTab, increaseTab, discountTab];

export default {
  id: 'pricing',
  title: 'Pricing',
  icon: '🏷️',
  group: 'Growth',
  render(root, ctx) {
    const s = ctx.state;
    pricingSlice(s);
    const tabs = TABS.filter((t) => !t.models || t.models.includes(s.company.model));
    const tab = tabs.find((t) => t.id === ctx.params) ?? tabs[0];
    const plan = mainPlan(s);
    mount(root, html`${css}
      <div class="app-head"><div><h1>Pricing lab</h1><p>Design how you charge, research willingness to pay, test prices on new signups and raise prices without torching your base. Three in four software companies changed pricing in the last year (Growth Unhinged 2025).</p></div></div>
      <div class="stats">${stat('Default plan', `${plan.name} ${money(plan.price)}/${plan.interval === 'year' ? 'yr' : 'mo'}`, `${s.plans.filter((p) => p.active).length} active plans`)}${stat('Model', PRICING_MODELS.find((m) => m.id === pricingSlice(s).model)?.label.split('(')[0] ?? '—')}${stat('Trial → paid (now)', pct(trialConversion(s), 1), `${trialingSubs(s).length} in trial`)}${stat('Market WTP', money(ensureMarket(s).fit.price.wtp ?? cfg(s).refPrice), ensureMarket(s).fit.price.source ?? 'baseline')}</div>
      <nav class="tabs">${tabs.map((t) => html`<a href="#/pricing/${t.id}" class="${t.id === tab.id ? 'active' : ''}">${t.label}</a>`)}</nav>
      ${tab.render(ctx)}`);
    tab.wire(root, ctx);
  },
  onDay(state) { pricingDay(state); },
  onMonthEnd(state) { pricingMonthEnd(state); },
};


