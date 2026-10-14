// Shared UI pieces for the Channels and Pricing apps: module-level drafts (so re-renders never wipe typing),
// a "write it → get feedback" judge box backed by the LLM panel, and small formatting helpers.

import { html, raw } from '../../core/ui.js';
import { hash, money, pct } from '../../core/util.js';
import { judgeArtifact, wc } from './judge.js';

// Module-level drafts keyed by purpose. Initialized lazily from the last judged text in state.
export const drafts = {};

export const judgedStore = (state) => {
  state.apps.channels ??= {};
  return (state.apps.channels.judged ??= {});
};
export function draftOf(state, key) {
  if (drafts[key] == null) drafts[key] = judgedStore(state)[key]?.text ?? '';
  return drafts[key];
}

// The judged result for the current draft text, or null if the text changed since it was judged.
export function currentJudged(state, key) {
  const j = judgedStore(state)[key];
  if (!j) return null;
  return j.hash === hash(draftOf(state, key)) ? j : null;
}

export async function runJudge(ctx, key, kind, { hours, label, extra = {}, minWords = 15 } = {}) {
  const text = draftOf(ctx.state, key);
  if (wc(text) < minWords) { ctx.toast(`Write at least ${minWords} words first.`, 'warn'); return null; }
  return ctx.act(async (st) => {
    const j = await judgeArtifact(ctx, kind, text, extra);
    judgedStore(st)[key] = { ...j, text: text.slice(0, 6000), hash: hash(text), kind };
    return j;
  }, { hours, label: label ?? 'Writing' });
}

// Textarea + feedback. Wire with wireDrafts(root) once per render.
export function judgeBox(state, key, { label, placeholder = '', rows = 6, hours = 0.5, button = 'Get feedback', hint = '' } = {}) {
  const text = draftOf(state, key);
  const j = judgedStore(state)[key];
  const fresh = currentJudged(state, key);
  return html`<div class="jbox">
    <label>${label}<textarea id="d_${key.replace(/[^a-z0-9_]/gi, '_')}" data-draft="${key}" rows="${rows}" placeholder="${placeholder}">${text}</textarea></label>
    <div class="inline" style="align-items:center"><button data-judge="${key}">${button} (${hours}h)</button>
      <span class="small muted">${wc(text)} words${hint ? ` · ${hint}` : ''}</span></div>
    ${j ? judgedView(j, !fresh) : ''}
  </div>`;
}

export function judgedView(j, stale = false) {
  const tone = j.score >= 7 ? 'good' : j.score >= 5 ? 'warn' : 'bad';
  return html`<div class="card" style="margin-top:8px">
    <div class="small"><span class="badge ${tone}">${j.score}/10</span> ${j.mock ? html`<span class="badge">offline judge</span>` : html`<span class="badge accent">LLM panel</span>`} ${stale ? html`<span class="badge warn">text changed — re-run feedback before using it</span>` : ''}</div>
    ${(j.results ?? []).map((r) => html`<div class="small" style="margin-top:6px"><b>${String(r.model ?? '').split('/').pop()}</b>: “${r.verdict}”${r.issues?.length ? html`<br><span class="muted">${r.issues.join(' · ')}</span>` : ''}${r.reply ? html`<br><i>Reply: ${r.reply}</i>` : ''}</div>`)}
  </div>`;
}

export const meter = (v, tone = '') => html`<div class="meter" title="${pct(v, 0)}"><div style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%${tone ? `;background:var(--${tone})` : ''}"></div></div>`;
export const designTag = html`<span class="badge" title="Game estimate bounded by the cited research, not a measured benchmark">game estimate</span>`;
export const src = (text) => html`<span class="small muted">${text}</span>`;
export const fmtMoney = (n) => money(n);
export const css = raw(`<style>
.ch-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.ch-cards .card{margin:0;display:flex;flex-direction:column;gap:4px}
.ch-cards .card h4{margin:0;font-size:14px}
.jbox textarea{min-height:110px}
.price-page{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.price-card{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--panel)}
.price-card.hl{border:2px solid var(--accent)}
.price-card .amt{font-size:26px;font-weight:700}
.price-card ul{padding-left:18px;margin:6px 0;font-size:13px}
.tier-row{display:grid;grid-template-columns:1fr 110px 1.6fr auto;gap:8px;align-items:end}
.kv{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;font-size:13px}
.kv b{font-weight:600}
@media (max-width:820px){.tier-row{grid-template-columns:1fr 1fr}.tier-row>*:nth-child(3){grid-column:1/-1}}
</style>`);

// Wire drafts + judge buttons for one render. map: { draftKey: [kind, hours, minWords, extra?] } where extra is
// an object or a function returning one (persona context for the judge).
export function wireJudgeHelper(root, ctx, map) {
  root.addEventListener('input', (e) => {
    const el = e.target.closest('[data-draft]');
    if (el) drafts[el.dataset.draft] = el.value;
  });
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-judge]');
    if (!el || !root.contains(el)) return;
    const spec = map[el.dataset.judge];
    if (!spec) return;
    const [kind, hours, minWords, extra] = spec;
    el.disabled = true;
    el.textContent = 'Readers are reading it…';
    runJudge(ctx, el.dataset.judge, kind, { hours, minWords, extra: typeof extra === 'function' ? extra() : extra ?? {}, label: 'Writing & feedback' });
  });
}
