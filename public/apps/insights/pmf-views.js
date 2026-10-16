// PMF views: survey cuts (segment / role / source / activation), retention by segment, false-PMF flags and the scorecard.
import { html, on } from '../../core/ui.js';
import { pct, fmtDate } from '../../core/util.js';
import { surveyCut, segmentVerdict, retentionByGroup, pmfScorecard, CUT_LABELS, MIN_CUT_N, PMF_LINE, hasIdea } from './pmf.js';
import { ensureLab, recordCut, recordRetentionView } from './lab.js';

const ui = { cutBy: 'segment', surveyId: null, retBy: 'segment' };
const CAV = { too_early: 'too early to tell', flattening: 'flattening', decaying: 'still decaying' };
const cls = (k) => (k === 'flattening' ? 'good' : k === 'decaying' ? 'bad' : '');

export function cutPanel(s, survey) {
  if (!survey?.rows?.length) return survey && survey.kind === 'pmf' && survey.status === 'closed' ? html`<p class="small muted">This survey has no per-customer answers to cut (no idea set in Settings, or nobody answered).</p>` : '';
  const groups = surveyCut(s, survey, ui.cutBy);
  const v = segmentVerdict(s, survey);
  return html`<div class="callout" style="margin-top:8px"><b>Cut the answers</b> <span class="small muted">(${fmtDate(s, survey.startDay)}, n=${survey.result.n})</span>
    <div class="inline" style="gap:6px;flex-wrap:wrap;margin:6px 0">${Object.entries(CUT_LABELS).map(([k, l]) => html`<button class="sm ${ui.cutBy === k ? 'primary' : ''}" data-cutby="${k}" data-cutsrv="${survey.id}">${l}</button>`)}</div>
    <table class="small"><thead><tr><th>${CUT_LABELS[ui.cutBy]}</th><th class="r">Answers</th><th class="r">Very disappointed</th><th>95% range</th><th></th></tr></thead><tbody>
      ${groups.map((g) => html`<tr><td>${g.label}</td><td class="r">${g.n}</td><td class="r"><b>${pct(g.share, 0)}</b></td><td>${pct(g.ci[0], 0)}-${pct(g.ci[1], 0)}</td><td>${!g.enough ? html`<span class="badge">n&lt;${MIN_CUT_N}: anecdote</span>` : g.meets ? html`<span class="badge good">above ${pct(PMF_LINE, 0)}</span>` : ''}</td></tr>`)}
    </tbody></table>
    ${ui.cutBy === 'segment' && v ? html`<p class="small">${v.text}</p>` : ''}
    ${v && v.friendShare >= 0.25 ? html`<p class="small callout warn">${Math.round(v.friendShare * 100)}% of answers are from your network. Compare with "Signup source".</p>` : ''}</div>`;
}

function retentionTable(s) {
  const rows = retentionByGroup(s, ui.retBy === 'source' ? 'source' : hasIdea(s) ? 'segment' : 'all');
  if (!rows.length) return html`<p class="empty">No paying customers yet.</p>`;
  const K = Math.max(...rows.map((r) => r.curve.filter((c) => c != null).length)) - 1;
  return html`<div class="table-wrap"><table class="small"><thead><tr><th>${ui.retBy === 'source' ? 'Source' : 'Segment'}</th><th class="r">Customers</th>${Array.from({ length: K + 1 }, (_, k) => html`<th>M${k}</th>`)}<th>Shape</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td>${r.label}</td><td class="r">${r.n}</td>${r.curve.slice(0, K + 1).map((c) => html`<td>${c == null ? '' : pct(c, 0)}</td>`)}<td><span class="badge ${cls(r.state)}">${CAV[r.state]}${r.floor != null && r.state !== 'too_early' ? ` at ${pct(r.floor, 0)}` : ''}</span></td></tr>`)}
  </tbody></table></div>`;
}

export function scorecardView(s) {
  const c = pmfScorecard(s);
  const sev = (f) => (f.severity === 'high' ? 'bad' : 'warn');
  return html`<div class="grid-2">
    <section class="panel"><h2>PMF scorecard</h2>
      <p class="small muted">Product-market fit is a pattern across several measures, not one survey. Every figure carries its sample size.</p>
      ${c.caveats.map((x) => html`<div class="small callout warn">${x}</div>`)}
      <ul class="list small">
        <li><b>Pull:</b> ${c.organic.share == null ? 'no signups in 90 days' : html`<b>${pct(c.organic.share, 0)}</b> of the last ${c.organic.n} signups came from organic, inbound or referral`} (${Object.entries(c.organic.mix).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}). Referrals ${c.pull.referrals}, inbound/organic ${c.pull.inbound}, expansions in 90 days ${c.pull.expansions}.</li>
        <li><b>Sales cycle:</b> ${c.salesCycle ? `${c.salesCycle.trend} (${c.salesCycle.recent} days recently vs ${c.salesCycle.prior} before; a shortening cycle is a pull signal)` : 'not enough won deals to read a trend'}.</li>
        <li><b>Sean Ellis:</b> ${c.sean ? html`${c.sean.verdict.text} <span class="muted">(${fmtDate(s, c.sean.day)}, n=${c.sean.n})</span>` : 'no segmented survey of activated users yet.'}</li>
      </ul>
      <h3>False-PMF checks</h3>
      ${c.flags.length ? c.flags.map((f) => html`<div class="small callout ${sev(f)}" style="margin:4px 0"><b>${f.label}.</b> ${f.detail}</div>`) : html`<p class="small muted">No false-PMF pattern showing in your numbers. That does not prove PMF: it only means none of the common illusions explains them.</p>`}
    </section>
    <section class="panel"><h2>Retention floor</h2>
      <div class="app-actions"><button class="sm ${ui.retBy === 'segment' ? 'primary' : ''}" data-retby="segment">By segment</button><button class="sm ${ui.retBy === 'source' ? 'primary' : ''}" data-retby="source">By source</button></div>
      ${retentionTable(s)}
      <p class="small muted">Logo retention by months since first payment. A curve that flattens at a floor is the real PMF signal; one that keeps sloping down means those customers do not need you. Needs 5+ customers per point.</p>
    </section></div>`;
}

export function wirePmf(root, ctx) {
  on(root, 'click', '[data-cutby]', (e, el) => { ui.cutBy = el.dataset.cutby; ctx.act((st) => recordCut(st, ui.cutBy, { surveyId: el.dataset.cutsrv }), { hours: 0.1, label: 'Cut survey results' }); });
  on(root, 'click', '[data-retby]', (e, el) => { ui.retBy = el.dataset.retby; ctx.act((st) => recordRetentionView(st, ui.retBy), { hours: 0.1, label: 'Review retention by segment' }); });
}
