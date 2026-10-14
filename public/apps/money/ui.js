// UI helpers shared by the money apps (Bank, Payments, Books, Analytics). DOM only inside functions.

import { html, raw, badge } from '../../core/ui.js';
import { money, fmtDate } from '../../core/util.js';

export const usd = (n) => money(n, { cents: true });
export const signed = (n) => (n > 0 ? `+${usd(n)}` : usd(n));
export const short = (state, day) => (day == null ? '—' : fmtDate(state, day).replace(/, \d{4}$/, ''));

const TONES = { succeeded: 'good', paid: 'good', active: 'good', won: 'good', done: 'good', trialing: 'accent', in_transit: 'accent', pending: 'accent', under_review: 'accent', extended: 'accent', refunded: 'warn', past_due: 'warn', open: 'warn', needs_response: 'bad', disputed: 'bad', failed: 'bad', canceled: '', uncollectible: 'bad', lost: 'bad', overdue: 'bad', missed: 'bad', na: '' };
export const statusBadge = (s, label = null) => badge(label ?? String(s ?? '').replace(/_/g, ' '), TONES[s] ?? '');

// Tabs as links: [{ id, label, count? }]
export function tabs(appId, items, active) {
  return html`<nav class="tabs">${items.map((t) => html`<a href="#/${appId}/${t.id}" class="${t.id === active ? 'active' : ''}">${t.label}${t.count ? html` <span class="badge ${t.tone ?? ''}">${t.count}</span>` : ''}</a>`)}</nav>`;
}

// Theme color from a CSS var.
const cssVar = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// Stacked bar chart (positive stacks up, negative stacks down). series: [{ label, values, color }]
export function stackedBars(canvas, labels, series, { height = 200, format = money, line = null } = {}) {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 300;
  canvas.style.height = `${height}px`;
  canvas.width = w * dpr; canvas.height = height * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  const n = labels.length || 1;
  const pos = labels.map((_, i) => series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0));
  const neg = labels.map((_, i) => series.reduce((a, s) => a + Math.min(0, s.values[i] ?? 0), 0));
  const lineVals = line?.values ?? [];
  const max = Math.max(1, ...pos, ...lineVals), min = Math.min(0, ...neg, ...lineVals);
  const pad = { l: 58, r: 6, t: 8, b: 18 };
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  const bw = (w - pad.l - pad.r) / n;
  g.font = '11px system-ui, sans-serif';
  g.fillStyle = cssVar('--muted');
  g.strokeStyle = cssVar('--border');
  for (const v of [min, 0, max]) { g.beginPath(); g.moveTo(pad.l, y(v)); g.lineTo(w - pad.r, y(v)); g.stroke(); g.fillText(format(v), 2, y(v) + 4); }
  labels.forEach((l, i) => {
    let up = 0, down = 0;
    for (const s of series) {
      const v = s.values[i] ?? 0;
      if (!v) continue;
      g.fillStyle = s.color.startsWith('--') ? cssVar(s.color) : s.color;
      const x = pad.l + i * bw + bw * 0.15;
      if (v > 0) { g.fillRect(x, y(up + v), bw * 0.7, y(up) - y(up + v)); up += v; }
      else { g.fillRect(x, y(down), bw * 0.7, y(down + v) - y(down)); down += v; }
    }
    if (n <= 14 || i % Math.ceil(n / 8) === 0) { g.fillStyle = cssVar('--muted'); g.fillText(l, pad.l + i * bw + 2, height - 4); }
  });
  if (line) {
    g.strokeStyle = cssVar(line.color ?? '--text'); g.lineWidth = 2; g.beginPath();
    lineVals.forEach((v, i) => { const x = pad.l + i * bw + bw / 2; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
    g.stroke();
  }
}

export const legend = (series) => html`<div class="small muted" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">${series.map((s) => html`<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(${s.color});vertical-align:-1px"></span> ${s.label}</span>`)}</div>`;

// Heatmap cell background for 0..1(+) values.
export function heat(v) {
  if (v == null) return '';
  const a = Math.max(0.06, Math.min(1, v));
  return `background: color-mix(in srgb, var(--accent) ${Math.round(a * 70)}%, transparent)`;
}

// Common CSS for a money app, prefixed with its id.
export function appCss(id) {
  return raw(`<style>
  [data-app="${id}"] .${id}-kpis { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }
  [data-app="${id}"] .${id}-row { display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid var(--border); }
  [data-app="${id}"] .${id}-row:last-child { border-bottom:0; }
  [data-app="${id}"] .${id}-row > span:last-child { font-variant-numeric:tabular-nums; text-align:right; }
  [data-app="${id}"] .${id}-big { font-size:30px; font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:-0.01em; }
  [data-app="${id}"] .${id}-filters { display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:10px; }
  [data-app="${id}"] .${id}-filters label { margin:0; flex:1 1 140px; min-width:0; }
  [data-app="${id}"] .${id}-drawer { position:fixed; top:0; right:0; bottom:0; width:min(440px,100%); background:var(--panel); border-left:1px solid var(--border); box-shadow:-10px 0 40px rgb(0 0 0 / .15); z-index:60; overflow-y:auto; padding:18px 18px 40px; }
  [data-app="${id}"] .${id}-drawer h2 { display:flex; justify-content:space-between; align-items:center; }
  [data-app="${id}"] .${id}-amt { font-variant-numeric:tabular-nums; white-space:nowrap; }
  [data-app="${id}"] .${id}-in { color:var(--good); }
  [data-app="${id}"] .${id}-sub { font-size:11.5px; color:var(--muted); }
  [data-app="${id}"] .${id}-tbl td.total, [data-app="${id}"] .${id}-tbl tr.total td { font-weight:650; border-top:2px solid var(--border); }
  [data-app="${id}"] .${id}-tbl tr.section td { background:var(--panel-2); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
  [data-app="${id}"] .${id}-tbl td.ind { padding-left:20px; }
  [data-app="${id}"] .${id}-heat td { text-align:center; font-size:12px; }
  [data-app="${id}"] .${id}-check { display:grid; grid-template-columns:auto 1fr auto; gap:8px 12px; align-items:start; padding:10px 0; border-bottom:1px solid var(--border); }
  [data-app="${id}"] .${id}-check .dot { width:20px; height:20px; border-radius:50%; border:2px solid var(--border); display:inline-flex; align-items:center; justify-content:center; font-size:12px; }
  [data-app="${id}"] .${id}-check .dot.ok { background:var(--good); border-color:var(--good); color:#fff; }
  [data-app="${id}"] .${id}-check .actions { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
  [data-app="${id}"] .${id}-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; }
  [data-app="${id}"] .${id}-card.sel { border-color:var(--accent); background:var(--accent-soft); }
  [data-app="${id}"] .${id}-flag { display:flex; gap:10px; padding:8px 0; border-bottom:1px solid var(--border); }
  [data-app="${id}"] .${id}-flag:last-child { border-bottom:0; }
  [data-app="${id}"] table select { padding:3px 6px; min-width:130px; }
  @media (max-width:820px) { [data-app="${id}"] .${id}-check { grid-template-columns:auto 1fr; } [data-app="${id}"] .${id}-check .actions { grid-column:1 / -1; justify-content:flex-start; } [data-app="${id}"] .${id}-big { font-size:24px; } }
  </style>`);
}
