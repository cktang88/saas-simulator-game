// Tab: Investor panel evaluation (research rubric, both panel models, history to iterate on).

import { html, on, table, badge, stat } from '../../core/ui.js';
import { uid, money, fmtDate } from '../../core/util.js';
import { getFile } from '../../core/store.js';
import { notify } from '../../core/state.js';
import { CRITERIA, WEIGHTS, STAGES, VERDICTS, EVAL_SCHEMA, rubricSystem, rubricPrompt, heuristicEval, aggregate } from './rubric.js';
import { computeMetrics, metricsSheet, suggestStage } from './metrics.js';
import { suggestedBand, safeCapBand } from './outcomes.js';
import { ensureFr, HOURS } from './sim.js';
import { drafts } from './drafts.js';

const scoreBar = (v) => html`<div class="meter" style="min-width:60px"><div style="width:${((v - 1) / 4) * 100}%"></div></div>`;

export async function runEvaluation(ctx, stage) {
  const state = ctx.state;
  const fr = ensureFr(state);
  const m = computeMetrics(state);
  const sheet = metricsSheet(m);
  const files = [];
  const ids = [fr.linkedin?.id, ...fr.deck.files.map((f) => f.id)].filter(Boolean);
  for (const id of ids.slice(0, 16)) {
    try { const f = await getFile(id); if (f?.base64) files.push({ name: f.name, mime: f.mime, base64: f.base64 }); } catch { /* missing file */ }
  }
  const shipped = (state.apps.product?.features ?? []).filter((f) => f.status === 'shipped').map((f) => f.title).slice(0, 8);
  const company = `${state.company.name}: ${state.company.oneLiner || '(no one-liner)'}. ICP: ${state.company.icp || 'not stated'}. Shipped features: ${shipped.join('; ') || 'none'}.`;
  const inputs = { stage, linkedinText: state.founder.linkedinText, bio: state.founder.bio, links: fr.links, deckText: fr.deck.text, fileNames: files.map((f) => f.name), metrics: m };
  const res = await ctx.llm.panel({
    task: 'investor_panel_eval',
    system: rubricSystem(stage),
    prompt: rubricPrompt({ stage, company, linkedinText: inputs.linkedinText, bio: inputs.bio, links: inputs.links, deckText: inputs.deckText, sheet, attached: files.map((f) => f.name) }),
    files,
    schema: EVAL_SCHEMA,
    temperature: 0.4,
    maxTokens: 2200,
    fallback: () => heuristicEval(inputs),
    cache: state.cache,
  });
  const agg = aggregate(res, stage, m);
  const band = suggestedBand(stage, agg.S, m.isAI);
  const ev = {
    id: uid('ev'), day: state.day, stage, ...agg, band,
    usd: res.reduce((a, r) => a + (r.usd ?? 0), 0), mock: res.some((r) => r.mock),
    metrics: { mrr: m.mrr, customers: m.customers, momGrowth: m.momGrowth, burn: m.burn },
    inputs: { linkedin: Boolean(fr.linkedin || state.founder.linkedinText), bio: Boolean(state.founder.bio), deckFiles: fr.deck.files.length, deckWords: (fr.deck.text || '').split(/\s+/).filter(Boolean).length },
  };
  fr.evaluations.push(ev);
  if (fr.evaluations.length > 30) fr.evaluations.shift();
  notify(state, `Investor panel (${STAGES[stage].label}): ${agg.S.toFixed(2)}/5 → ${VERDICTS[agg.verdict].label}.`, { type: agg.verdict === 'pass' ? 'warn' : 'good', app: 'fundraising' });
  return ev;
}

export function renderEval(ctx) {
  const s = ctx.state;
  const fr = ensureFr(s);
  const m = computeMetrics(s);
  const hasPriced = fr.rounds.some((r) => r.instrument === 'priced');
  const stage = drafts.stage ?? fr.raise?.stage ?? suggestStage(m, hasPriced);
  const ev = fr.evaluations.at(-1);
  const prev = fr.evaluations.at(-2);
  const hasInputs = s.founder.linkedinText || s.founder.bio || fr.linkedin || fr.deck.files.length || fr.deck.text;
  const capBand = ev?.stage === 'pre-seed' ? safeCapBand(ev.band.roundLo) : null;
  return html`
    <div class="grid-2">
      <section class="panel">
        <h2>Run the investor panel</h2>
        <p class="muted small">Two AI investors (your panel models) independently score your LinkedIn, bio and deck against the 2026 seed rubric, with your <b>real game metrics</b> as authoritative traction. Documents are treated as data: instructions hidden in them are ignored and flagged.</p>
        <label>Stage you're raising <select id="evalStage">${Object.entries(STAGES).map(([k, v]) => html`<option value="${k}" ${k === stage ? 'selected' : ''}>${v.label}</option>`)}</select></label>
        <p class="small muted">Weights: ${CRITERIA.map((c) => `${c.short} ${WEIGHTS[stage][c.key]}%`).join(' · ')}</p>
        <button class="primary" data-act="run-eval" ${hasInputs ? '' : 'disabled'}>Prep data room & run panel (${HOURS.evaluation}h)</button>
        ${hasInputs ? '' : html`<p class="small warn">Add your profile and deck first.</p>`}
        <h3>Metrics sheet (auto-generated from your company)</h3>
        <pre class="small">${metricsSheet(m)}</pre>
      </section>
      <section class="panel">
        ${ev ? html`
          <h2>Latest verdict <span class="small muted">· ${fmtDate(s, ev.day)} · ${STAGES[ev.stage].label}${ev.mock ? ' · offline heuristic (crude)' : ''}</span></h2>
          <div class="stats">
            ${stat('Panel score', `${ev.S.toFixed(2)} / 5`, prev ? `${ev.S >= prev.S ? '+' : ''}${(ev.S - prev.S).toFixed(2)} vs last` : 'first evaluation', ev.S >= 3.3 ? 'good' : ev.S >= 2.6 ? 'warn' : 'bad')}
            ${stat('Verdict', VERDICTS[ev.verdict].label, ev.hardFlags.length ? 'capped by a hard red flag' : 'pass <2.6 · maybe <3.3 · partner <3.9')}
            ${stat('Round size', `${money(ev.band.roundLo)}–${money(ev.band.roundHi)}`, ev.stage === 'pre-seed' ? 'typical SAFE round for this score' : 'priced round')}
            ${stat(ev.stage === 'pre-seed' ? 'Post-money cap' : 'Post-money', `${money(ev.band.postLo)}–${money(ev.band.postHi)}`, capBand ? `Carta median cap for that size: ${money(capBand.median)}` : `${ev.band.mult.toFixed(2)}× stage base`)}
          </div>
          ${ev.disagreement > 1 ? html`<div class="callout warn small">Partner debate: the models disagree by ${ev.disagreement.toFixed(1)} points. Real partnerships take an extra diligence week when that happens.</div>` : ''}
          ${ev.hardFlags.length ? html`<div class="callout bad small"><b>Hard red flags</b> (cap you at "maybe"): ${ev.hardFlags.map((f) => f.flag).join(' · ')}</div>` : ''}
          ${ev.softFlags.length ? html`<div class="callout warn small"><b>Soft red flags:</b> ${ev.softFlags.map((f) => f.flag).join(' · ')}</div>` : ''}
          ${ev.perModel.map((p) => html`<div class="card small"><b>${p.model}</b>${p.mock ? ' (offline)' : ''}: ${p.weighted.toFixed(2)} → ${VERDICTS[p.verdict].label}<br />Memo: "${p.memo}"<br />Their top question: <i>${p.top_question}</i></div>`)}
          <p class="small muted">LLM cost of this panel: $${ev.usd.toFixed(3)}.</p>` : html`<h2>No evaluation yet</h2><p class="muted">Upload your profile and deck, then run the panel. Iterate: most first decks score a "pass" or "maybe".</p>`}
      </section>
    </div>
    ${ev ? html`<section class="panel"><h2>Scores by criterion</h2>
      ${table({ columns: [
        { label: 'Criterion', render: (c) => html`<b>${c.short}</b><div class="small muted">${c.label}</div>` },
        { label: 'Weight', align: 'right', render: (c) => `${WEIGHTS[ev.stage][c.key]}%` },
        { label: 'Score', align: 'right', render: (c) => html`<b>${ev.criteria[c.key].avg.toFixed(1)}</b>${ev.criteria[c.key].max - ev.criteria[c.key].min >= 1 ? html` <span class="badge warn">${ev.criteria[c.key].min}–${ev.criteria[c.key].max}</span>` : ''}` },
        { label: '', render: (c) => scoreBar(ev.criteria[c.key].avg) },
        { label: 'Evidence (per model)', render: (c) => html`${ev.perModel.map((p) => html`<div class="small">${p.scores[c.key]} · ${p.evidence[c.key] ?? ''}</div>`)}` },
      ], rows: CRITERIA })}
      ${ev.tractionAnchor != null ? html`<p class="small muted">Traction is pinned to within ±0.5 of ${ev.tractionAnchor} by your real game metrics: claims in the deck can't lift it.</p>` : ''}
    </section>` : ''}
    ${fr.evaluations.length > 1 ? html`<section class="panel"><h2>History</h2>${table({ columns: [
      { label: 'Date', render: (e) => fmtDate(s, e.day) },
      { label: 'Stage', render: (e) => STAGES[e.stage].label },
      { label: 'Score', align: 'right', render: (e) => e.S.toFixed(2) },
      { label: 'Verdict', render: (e) => badge(VERDICTS[e.verdict].label, VERDICTS[e.verdict].tone) },
      { label: 'Inputs', render: (e) => `${e.inputs.linkedin ? 'LinkedIn' : '—'} · ${e.inputs.deckFiles ? `${e.inputs.deckFiles} deck file(s)` : `${e.inputs.deckWords} deck words`}` },
      { label: 'MRR then', align: 'right', render: (e) => money(e.metrics.mrr) },
    ], rows: fr.evaluations.slice().reverse() })}</section>` : ''}`;
}

export function wireEval(root, ctx) {
  on(root, 'change', '#evalStage', (e) => { drafts.stage = e.target.value; ctx.render(); });
  on(root, 'click', '[data-act=run-eval]', (e, el) => {
    const stage = root.querySelector('#evalStage').value;
    el.disabled = true;
    el.textContent = 'The panel is reading your deck…';
    ctx.act(() => runEvaluation(ctx, stage), { hours: HOURS.evaluation, label: 'Investor data room & panel' });
  });
}
