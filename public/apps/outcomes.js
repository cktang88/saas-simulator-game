// Founder scorecard: the habits that separate elite founders from typical ones, the warning signs that precede
// the common ways companies die, and the luck you have had (and how much of it you made). Engine: outcomes/engine.js.

import { html, mount, badge, stat } from '../core/ui.js';
import { fmtDate } from '../core/util.js';
import { ensureOutcomes, outcomesDay, signals, EVENTS, eventRate, surfaceMultiplier, activity } from './outcomes/engine.js';
import { SURFACE_AREA_REFS } from '../data/outcomes.js';

const ACT_LABELS = {
  publicPostsPerWeek: ['Public posts / week', (v) => v.toFixed(1)],
  audienceSize: ['Audience', (v) => Math.round(v).toLocaleString()],
  launchesPerYear: ['Launches / year', (v) => v],
  customerConversationsPerWeek: ['Customer conversations / week', (v) => v.toFixed(1)],
  shippedFeaturesPerMonth: ['Features shipped / month', (v) => v.toFixed(1)],
  outboundTouchesPerWeek: ['Outbound touches / week', (v) => Math.round(v)],
  contentPiecesPerMonth: ['Content pieces / month', (v) => v.toFixed(1)],
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
    const odds = EVENTS.filter((e) => e.polarity === 'positive').map((e) => ({ e, rate: eventRate(s, e, act), mult: surfaceMultiplier(s, e, act) })).sort((a, b) => b.rate - a.rate);
    mount(root, html`
      <div class="app-head"><div><h1>Scorecard</h1><p>Most founders make little or nothing: over half of indie products never earn a dollar, and about 1 in 6 subscription apps reaches $1k a month. The few who break out usually do a handful of unglamorous things every week and take many shots. Luck matters, but you make more of it by being visible, shipping and talking to people.</p></div></div>
      <div class="stats">
        ${stat('Elite habits', `${met} / ${sig.habits.length}`, 'met right now', met >= 5 ? 'good' : met <= 2 ? 'warn' : '')}
        ${stat('Warning signs', sig.warnings.length, sig.warnings.length ? 'see below' : 'none right now', sig.warnings.length ? 'bad' : 'good')}
        ${stat('Lucky breaks', o.events.filter((e) => e.polarity === 'positive').length, 'so far')}
        ${stat('Bad breaks', o.events.filter((e) => e.polarity === 'negative').length, 'so far')}
      </div>
      ${sig.warnings.length ? html`<section class="panel"><h2>Warning signs</h2>${sig.warnings.map((w) => html`<div class="callout bad"><b>${w.label}</b><p>${w.detail}</p><p class="small muted">How this usually ends: ${w.ends}</p></div>`)}</section>` : ''}
      <div class="grid-2">
        <section class="panel"><h2>Habits of elite founders</h2>
          <table><tbody>${sig.habits.map((h) => html`<tr><td>${h.met ? badge('yes', 'good') : badge('not yet', '')}</td><td><b>${h.label}</b><div class="small muted">${h.detail}</div><div class="small">${h.why}</div></td></tr>`)}</tbody></table>
        </section>
        <section class="panel"><h2>Your surface area for luck</h2>
          <p class="small muted">Compared with a reference founder. More activity raises the odds of lucky breaks, with diminishing returns.</p>
          <table><tbody>${Object.entries(ACT_LABELS).map(([k, [label, fmt]]) => html`<tr><td>${label}</td><td class="r">${fmt(act[k] ?? 0)}</td><td class="r muted small">ref ${SURFACE_AREA_REFS[k]}</td></tr>`)}</tbody></table>
          <h3>Odds of a lucky break this year</h3>
          <table><tbody>${odds.map(({ e, rate, mult }) => html`<tr><td>${e.label ?? e.id}</td><td class="r">${rate > 0 ? `${Math.round((1 - Math.exp(-rate)) * 100)}%` : html`<span class="muted">not possible yet</span>`}</td><td class="r small muted">${rate > 0 ? `${mult.toFixed(1)}× typical` : ''}</td></tr>`)}</tbody></table>
        </section>
      </div>
      <section class="panel"><h2>Luck so far</h2>
        ${o.events.length ? html`<ul class="list">${o.events.map((e) => html`<li>${fmtDate(s, e.day)} · ${badge(e.polarity === 'positive' ? 'good break' : 'bad break', e.polarity === 'positive' ? 'good' : 'bad')} <b>${e.label}</b><div class="small">${e.text}</div>${e.polarity === 'positive' ? html`<div class="small muted">Your activity made this ${e.mult.toFixed(1)}× as likely as for a typical founder.</div>` : ''}</li>`)}</ul>` : html`<p class="muted">Nothing yet. Luck mostly finds founders who ship, post, launch and talk to customers.</p>`}
      </section>`);
  },
};
