// Founder scorecard: the habits that separate elite founders from typical ones, the warning signs that precede
// the common ways companies die, and the luck you have had (and how much of it you made). Engine: outcomes/engine.js.

import { html, mount, badge, stat } from '../core/ui.js';
import { fmtDate } from '../core/util.js';
import { ensureOutcomes, outcomesDay, signals, EVENTS, eventRate, surfaceMultiplier, activity } from './outcomes/engine.js';
import { SURFACE_AREA_REFS } from '../data/outcomes.js';
import { OPERATOR_TIERS, OPERATOR_FUNCTION_IDS } from '../data/operator-tiers.js';
import { readOperators, mistakesSummary, TIER_RANK } from '../core/operator.js';
import { learningMode, reviewFor, adviceFor, lessonFor, hasSource } from '../core/advice.js';
import { ensurePlanner, CRITERION_METRICS } from './assistant/planner.js';
import './outcomes/readers.js'; // default readers for functions whose state is readable from here

const TIER_BADGE = { stellar: ['stellar', 'good'], good: ['good', 'accent'], average: ['average', 'warn'], mediocre: ['mediocre', 'bad'] };
const fnLabel = (id) => OPERATOR_TIERS[id]?.label ?? (id === 'general' ? 'General' : id);
const usd = (n) => `$${Math.round(n).toLocaleString()}`;
function costLine(c) {
  const parts = [];
  if (c.usd) parts.push(usd(c.usd));
  if (c.hours) parts.push(`${Math.round(c.hours * 10) / 10}h`);
  if (c.customers) parts.push(`${Math.round(c.customers * 10) / 10} customer${c.customers === 1 ? '' : 's'}`);
  if (c.reputation) parts.push(`${Math.round(c.reputation)} reputation`);
  if (c.days) parts.push(`${Math.round(c.days)} days lost`);
  return parts.join(' · ') || 'cost still landing';
}

// Raw data only by default: what you did (activity, results, the mistakes ledger, kill criteria). Tier badges, coaching,
// habit explanations, "how this usually ends" and luck odds are judgments: they come from a person (a board member, an
// advisor covering that function) or from Settings -> Built-in coaching (learning mode). core/advice.js is the gate.
function operatorPanel(s) {
  const reads = readOperators(s);
  const known = Object.values(reads).filter((r) => r.tier !== 'unknown');
  const reviews = known.map((r) => ({ r, rev: reviewFor(s, r.functionId, r) })).filter((x) => x.rev.covered).sort((a, b) => TIER_RANK[a.r.tier] - TIER_RANK[b.r.tier]);
  const uncovered = known.length - reviews.length;
  return html`<section class="panel"><h2>${learningMode(s) ? 'Operator quality by function' : 'Reviews from your advisors'}</h2>
    ${learningMode(s) ? html`<p class="small muted">Built-in coaching is on (Settings). Tiers are game estimates, not real statistics. Weakest first.</p>` : html`<p class="small muted">The scorecard shows what you did. Judgements on how well you are running each function come from people: a board member, an advisor, a consultant. Recruit them in <a href="#/advisors">Advisors</a>. They only see what you share, and they are not all equally good.</p>`}
    ${reviews.length ? html`<ul class="list">${reviews.map(({ r, rev }) => {
      const [label, kind] = rev.tier ? TIER_BADGE[rev.tier] : [null, null];
      return html`<li><div>${label ? badge(label, kind) : ''} <b>${fnLabel(r.functionId)}</b> <span class="small muted">${rev.learning ? rev.reviewer : `${rev.reviewer}: ${rev.by.join(', ')}`}</span></div>
        ${rev.evidence.length ? html`<div class="small muted">${rev.evidence.join(' · ')}</div>` : ''}
        ${rev.needsData.length && !rev.items.length ? html`<div class="small muted">${rev.needsData.join(', ')} cannot say much without seeing your numbers: share data with them in Advisors.</div>` : ''}
        ${rev.items.length ? html`<ul class="small">${rev.items.slice(0, 4).map((c) => html`<li>${c.text} <span class="muted">(${c.from})</span></li>`)}</ul>` : ''}</li>`;
    })}</ul>` : html`<p class="muted">${known.length ? 'Nobody you work with has reviewed this yet.' : 'No reads yet. Each function gets a read once you have actually done some of it.'}</p>`}
    ${uncovered > 0 && !learningMode(s) ? html`<p class="small muted">${uncovered} function${uncovered === 1 ? '' : 's'} with activity ${uncovered === 1 ? 'has' : 'have'} no advisor covering ${uncovered === 1 ? 'it' : 'them'}.</p>` : ''}
  </section>`;
}

// Kill and pivot criteria you wrote: status only (the decision is yours; see You).
function criteriaPanel(s) {
  const open = ensurePlanner(s).criteria.filter((c) => ['active', 'missed', 'met'].includes(c.status));
  if (!open.length) return '';
  const tone = { active: 'accent', missed: 'bad', met: 'good' };
  return html`<section class="panel"><h2>Kill and pivot criteria</h2><ul class="list small">${open.map((c) => html`<li>${badge(c.status, tone[c.status])} <b>${CRITERION_METRICS[c.metric]} ${c.threshold}</b> by ${fmtDate(s, c.byDay)}${Number.isFinite(c.value) ? ` · actual ${c.value}` : ''}</li>`)}</ul></section>`;
}

// What mistakes have cost so far: totals, the costliest mistakes, going-in-circles events and the latest entries.
function mistakesPanel(s) {
  const m = mistakesSummary(s);
  if (!m.count) return html`<section class="panel"><h2>What your mistakes cost</h2><p class="muted">Nothing logged yet. Mistakes always cost something (hours, money, customers, reputation or time going in circles), sometimes weeks later; they will be traced here.</p></section>`;
  return html`<section class="panel"><h2>What your mistakes cost</h2>
    <div class="stats">
      ${stat('Hours lost', `${Math.round(m.hours)}h`, `${m.count} mistakes logged`, m.hours > 40 ? 'bad' : 'warn')}
      ${stat('Money lost', usd(m.usd), m.delayed ? `${m.delayed} landed later` : '', m.usd > 5000 ? 'bad' : 'warn')}
      ${stat('Customers lost', Math.round(m.customers * 10) / 10, m.reputation ? `${Math.round(m.reputation)} reputation` : '', m.customers >= 1 ? 'bad' : '')}
      ${stat('Going in circles', m.circles, m.days ? `${Math.round(m.days)} calendar days lost` : 'rebuilds, re-pitches, re-hires', m.circles ? 'warn' : '')}
    </div>
    <div class="grid-2">
      <div><h3>Costliest mistakes</h3><table><tbody>${m.byMistake.slice(0, 8).map((b) => html`<tr><td><b>${b.label}</b>${b.count > 1 ? html` <span class="muted small">×${b.count}</span>` : ''}<div class="small muted">${fnLabel(b.functionId)}</div></td><td class="r small">${costLine(b)}</td></tr>`)}</tbody></table></div>
      <div><h3>${m.circleEvents.length ? 'Going in circles' : 'Latest'}</h3><ul class="list small">${(m.circleEvents.length ? m.circleEvents : m.recent).slice(0, 8).map((x) => html`<li><span class="muted">${fmtDate(s, x.day)}</span> ${x.app ? html`<a href="#/${x.app}">${x.label}</a>` : html`<b>${x.label}</b>`} ${x.delayed ? badge('delayed', 'warn') : ''}<div>${x.detail}</div>${lessonFor(s, x).map((l) => html`<div class="small">${l.text} <span class="muted">(${l.from})</span></div>`)}<div class="muted">${costLine(x.cost)}</div></li>`)}</ul></div>
    </div>
    ${m.byFunction.length > 1 ? html`<p class="small muted">By function: ${m.byFunction.slice(0, 6).map((f) => `${fnLabel(f.functionId)} ${costLine(f)}`).join(' · ')}</p>` : ''}
  </section>`;
}

const ACT_LABELS = {
  publicPostsPerWeek: ['Public posts / week (quality-weighted)', (v) => v.toFixed(1)],
  audienceSize: ['Audience', (v) => Math.round(v).toLocaleString()],
  launchesPerYear: ['Launches / year', (v) => v],
  customerConversationsPerWeek: ['Customer conversations / week', (v) => v.toFixed(1)],
  shippedFeaturesPerMonth: ['Features shipped / month', (v) => v.toFixed(1)],
  outboundTouchesPerWeek: ['Outbound touches / week (quality-weighted)', (v) => Math.round(v)],
  contentPiecesPerMonth: ['Content pieces / month (quality-weighted)', (v) => v.toFixed(1)],
  mrr: ['MRR', (v) => `$${Math.round(v).toLocaleString()}`],
  growthRateMonthly: ['MRR growth / month', (v) => `${Math.round(v * 100)}%`],
  communityAnswersPerWeek: ['Community answers / week', (v) => v.toFixed(1)],
  integrationsLive: ['Integrations & partner programs live', (v) => v],
};

export default {
  id: 'outcomes',
  title: 'Scorecard',
  icon: '🎯',
  group: 'Home',
  badge: (state) => signals(state).warnings.length || null,
  onDay: outcomesDay,
  render(root, ctx) {
    const s = ctx.state;
    const o = ensureOutcomes(s);
    const sig = signals(s);
    const act = activity(s);
    const met = sig.habits.filter((h) => h.met).length;
    const showOdds = learningMode(s) || hasSource(s, 'board');
    const odds = EVENTS.filter((e) => e.polarity === 'positive').map((e) => ({ e, rate: eventRate(s, e, act), mult: surfaceMultiplier(s, e, act) })).sort((a, b) => b.rate - a.rate);
    mount(root, html`
      <div class="app-head"><div><h1>Scorecard</h1><p>Most founders make little or nothing: over half of indie products never earn a dollar, and about 1 in 6 subscription apps reaches $1k a month. The few who break out usually do a handful of unglamorous things every week and take many shots. </p></div></div>
      <div class="stats">
        ${stat('Elite habits', `${met} / ${sig.habits.length}`, 'met right now', met >= 5 ? 'good' : met <= 2 ? 'warn' : '')}
        ${stat('Warning signs', sig.warnings.length, sig.warnings.length ? 'see below' : 'none right now', sig.warnings.length ? 'bad' : 'good')}
        ${stat('Lucky breaks', o.events.filter((e) => e.polarity === 'positive').length, 'so far')}
        ${stat('Bad breaks', o.events.filter((e) => e.polarity === 'negative').length, 'so far')}
      </div>
      ${criteriaPanel(s)}
      ${operatorPanel(s)}
      ${mistakesPanel(s)}
      ${sig.warnings.length ? html`<section class="panel"><h2>Warning signs</h2>${sig.warnings.map((w) => html`<div class="callout bad"><b>${w.label}</b><p>${w.detail}</p>${adviceFor(s, 'general', [`How this usually ends: ${w.ends}`], { kind: 'warning' }).map((a) => html`<p class="small muted">${a.text} <span>(${a.from})</span></p>`)}</div>`)}</section>` : ''}
      <div class="grid-2">
        <section class="panel"><h2>Habits of elite founders</h2>
          <table><tbody>${sig.habits.map((h) => html`<tr><td>${h.met ? badge('yes', 'good') : badge('not yet', '')}</td><td><b>${h.label}</b><div class="small muted">${h.detail}</div>${learningMode(s) && h.note ? html`<div class="small">${h.note}</div>` : ''}</td></tr>`)}</tbody></table>
        </section>
        <section class="panel"><h2>Your surface area for luck</h2>
          <p class="small muted">Your activity next to the game's reference founder. The reference values are game assumptions [design], not measured averages. Posts, articles and outreach count by judged quality.</p>
          <table><tbody>${Object.entries(ACT_LABELS).map(([k, [label, fmt]]) => html`<tr><td>${label}</td><td class="r">${fmt(act[k] ?? 0)}</td><td class="r muted small">ref ${SURFACE_AREA_REFS[k]}</td></tr>`)}</tbody></table>
          ${showOdds ? html`<h3>Odds of a lucky break this year</h3>
          <p class="small muted">The game's own luck model [design]: rates are game estimates bounded by research, not real-world statistics.</p>
          <table><tbody>${odds.map(({ e, rate, mult }) => html`<tr><td>${e.label ?? e.id}</td><td class="r">${rate > 0 ? `${Math.round((1 - Math.exp(-rate)) * 100)}%` : html`<span class="muted">not possible yet</span>`}</td><td class="r small muted">${rate > 0 ? `${mult.toFixed(1)}× typical` : ''}</td></tr>`)}</tbody></table>` : ''}
        </section>
      </div>
      <section class="panel"><h2>Luck so far</h2>
        ${o.events.length ? html`<ul class="list">${o.events.map((e) => html`<li>${fmtDate(s, e.day)} · ${badge(e.polarity === 'positive' ? 'good break' : 'bad break', e.polarity === 'positive' ? 'good' : 'bad')} <b>${e.label}</b><div class="small">${e.text}</div>${showOdds && e.polarity === 'positive' ? html`<div class="small muted">In the game's luck model [design], your activity made this ${e.mult.toFixed(1)}× as likely as for the reference founder.</div>` : ''}</li>`)}</ul>` : html`<p class="muted">Nothing yet.</p>`}
      </section>`);
  },
};
