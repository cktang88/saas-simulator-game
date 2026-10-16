// Shared UI: search any agency or vendor in the niche you describe, check references, run a paid trial, hire.
// Engine: ./agencies.js. Quality stays hidden until you vet; the panel shows only what the player could learn.

import { html, mount, on, formData, table, badge, toast } from '../../core/ui.js';
import { money, pct } from '../../core/util.js';
import * as AG from './agencies.js';
import { adviceFor } from '../../core/advice.js';

const SPEC = { specialist: ['specialist in this niche', 'good'], vertical: ['knows your industry', 'info'], generalist: ['generalist', 'warn'] };

export function agencyPanel(body, ctx, drafts, { kinds = AG.KIND_IDS } = {}) {
  const s = ctx.state;
  const q = drafts.agQuery ?? '';
  const kind = drafts.agKind ?? kinds[0];
  let res = null;
  try { if (drafts.agSearched) res = AG.searchAgencies(s, { query: q, kind }); } catch { res = null; }
  mount(body, html`
    <section class="panel"><h2>Find an agency or vendor</h2>
      <form id="agSearch">
        <div class="grid-2">
          <label>What kind of firm <select name="kind" data-draft="agKind">${kinds.map((k) => html`<option value="${k}" ${k === kind ? 'selected' : ''}>${AG.KINDS[k].label}</option>`)}</select></label>
          <label>Who they must know (the narrower, the fewer but better-fitting firms) <input name="query" data-draft="agQuery" value="${q}" placeholder="e.g. multi-location dental practices in Texas using Dentrix" /></label>
        </div>
        <button class="primary">Search (30 min)</button>
      </form>
      <p class="hint">Quality is hidden. Most firms are mediocre, a few are great, some take the money and vanish. Offered references flatter; call a client they did not list or pay for a small trial.</p>
    </section>
    ${res ? html`<section class="panel"><h2>${res.listings.length} firms for ${res.nicheLabel || 'your market'}${res.researched ? '' : ' (offline estimates)'}</h2>
      ${table({ columns: [
        { label: 'Firm', render: (l) => html`<b>${l.name}</b> ${badge(SPEC[l.specialty][0], SPEC[l.specialty][1])}<div class="small muted">${l.pitch}</div>` },
        { label: 'Price', render: (l) => html`${money(l.priceUsd)} <span class="small muted">${l.unit}</span><div class="small muted">${l.upfrontPct ? `${Math.round(l.upfrontPct * 100)}% up front` : 'pay as delivered'}${l.minMonths ? ` · ${l.minMonths}-month minimum` : ''}</div>` },
        { label: 'What you know', render: (l) => html`${l.estimate == null ? html`<span class="muted">nothing yet</span>` : html`~${pct(l.estimate, 0)} ± ${Math.round((l.estimateSd ?? 0.3) * 100)}`}${l.referenceNotes.map((t) => html`<div class="small muted">${t}</div>`)}${l.trialNote ? html`<div class="small muted">${l.trialNote}</div>` : ''}` },
        { label: '', render: (l) => (l.engaged ? badge('hired', 'good') : html`<button data-ref="${l.id}">References (1.5h)</button> <button data-back="${l.id}">Call a client they did not list (2.5h)</button> <button data-trial="${l.id}">Paid trial</button> <button class="primary" data-hire="${l.id}">Hire</button>`) },
      ], rows: res.listings })}</section>` : ''}`);
  on(body, 'submit', '#agSearch', async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    drafts.agQuery = f.query; drafts.agKind = f.kind; drafts.agSearched = true;
    await ctx.act(async (st) => { AG.searchAgencies(st, { query: f.query, kind: f.kind }); return true; }, { hours: AG.HOURS.search, label: 'Agency search' });
  });
  const run = (sel, hours, label, fn) => on(body, 'click', sel, async (e, el) => {
    await ctx.act(async (st) => { try { fn(st, el.dataset); } catch (err) { toast(err.message, 'warn'); return false; } return true; }, { hours, label });
  });
  run('[data-ref]', AG.HOURS.references, 'Agency references', (st, d) => AG.checkReferences(st, d.ref));
  run('[data-back]', AG.HOURS.backchannel, 'Backchannel on an agency', (st, d) => AG.checkReferences(st, d.back, { backchannel: true }));
  run('[data-trial]', AG.HOURS.trial, 'Agency trial project', (st, d) => AG.runTrial(st, d.trial));
  run('[data-hire]', 1, 'Briefing an agency', (st, d) => {
    const { engagement, lessons } = AG.engage(st, d.hire, { brief: drafts.agBrief ?? '' });
    // What a better-vetted hire would have done is advice: it only comes from a recruited source (or learning mode).
    const adv = adviceFor(st, 'partnerships_channels', lessons, { kind: 'lesson' });
    const v = engagement.vetted;
    const fact = v.references || v.backchannel || v.trial ? '' : ' No references, backchannel or trial beforehand.';
    toast(adv.length ? `Hired.${fact} ${adv[0].from}: ${adv[0].text}` : `Hired.${fact}`, 'info');
  });
}
