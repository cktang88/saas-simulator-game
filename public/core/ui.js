// Tiny UI toolkit shared by all apps. `html` is a tagged template that escapes every interpolated
// value unless it is itself html`` output, so untrusted text (prospect names, websites, LLM output)
// can never inject markup.

import { escapeHtml, money } from './util.js';

export class Html {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Html(String(s ?? ''));

function interp(v) {
  if (v == null || v === false) return '';
  if (v instanceof Html) return v.s;
  if (Array.isArray(v)) return v.map(interp).join('');
  return escapeHtml(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += interp(vals[i]) + strings[i + 1];
  return new Html(out);
}

export function mount(root, tpl) {
  root.innerHTML = String(tpl);
  return root;
}

// Event delegation: on(root, 'click', '[data-act=save]', (e, el) => ...)
export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  });
}

export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number' || el.type === 'range') out[el.name] = el.value === '' ? null : Number(el.value);
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type !== 'file') out[el.name] = el.value;
  }
  return out;
}

// columns: [{ key, label, align: 'right', render: (row) => html|string }]
export function table({ columns, rows, empty = 'Nothing here yet.', rowAttrs = () => '', className = '' }) {
  if (!rows.length) return html`<p class="empty">${empty}</p>`;
  return html`<div class="table-wrap"><table class="${className}"><thead><tr>${columns.map((c) => html`<th class="${c.align === 'right' ? 'r' : ''}">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr ${raw(rowAttrs(r))}>${columns.map((c) => html`<td class="${c.align === 'right' ? 'r' : ''}">${c.render ? c.render(r) : r[c.key]}</td>`)}</tr>`)}</tbody></table></div>`;
}

// Stat tiles are for figures. A long text value (a category, a description) gets a wide, smaller, clamped tile instead
// of wrapping one word per line in the figure font; the full text stays in the tooltip.
export function stat(label, value, sub = '', tone = '') {
  // Measure the visible text, whether the value is a string, a number or an html`` fragment (badges, links...).
  const text = value instanceof Html ? String(value).replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/gi, 'x').replace(/\s+/g, ' ').trim() : String(value ?? '');
  const long = text.length > 22;
  return html`<div class="stat ${tone}${long ? ' long' : ''}"><div class="stat-label">${label}</div><div class="stat-value" title="${long ? text : ''}">${value}</div><div class="stat-sub">${sub}</div></div>`;
}

export function badge(text, tone = '') {
  return html`<span class="badge ${tone}">${text}</span>`;
}

export function empty(text, actionHtml = '') {
  return html`<div class="empty-state"><p>${text}</p>${actionHtml}</div>`;
}

// ---- Modal ----

// modal({ title, body: Html, actions: [{ label, primary, onClick(dialog, form) → false keeps it open }], wide })
export function modal({ title, body, actions = [{ label: 'Close' }], wide = false, onOpen = null }) {
  const d = document.createElement('dialog');
  d.className = `modal${wide ? ' wide' : ''}`;
  d.innerHTML = String(html`<form method="dialog" class="modal-form"><h2>${title}</h2><div class="modal-body">${body}</div>
    <div class="modal-actions">${actions.map((a, i) => html`<button type="${a.primary ? 'submit' : 'button'}" data-i="${i}" class="${a.primary ? 'primary' : a.danger ? 'danger' : ''}">${a.label}</button>`)}</div></form>`);
  document.body.append(d);
  const form = d.querySelector('form');
  const close = () => { d.close(); d.remove(); };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = actions.find((x) => x.primary);
    if (a?.onClick && (await a.onClick(d, form)) === false) return;
    close();
  });
  d.querySelectorAll('.modal-actions button[type=button]').forEach((b) => b.addEventListener('click', async () => {
    const a = actions[+b.dataset.i];
    if (a.onClick && (await a.onClick(d, form)) === false) return;
    close();
  }));
  d.addEventListener('cancel', () => d.remove());
  d.showModal();
  onOpen?.(d, form);
  return { dialog: d, close };
}

export function toast(text, type = 'info', ms = 4500) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = text;
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

// ---- Files ----

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    const isText = /^text\/|json|csv|html|markdown/.test(file.type) || /\.(txt|md|csv|html?|json)$/i.test(file.name);
    r.onload = () => {
      if (isText) resolve({ name: file.name, mime: file.type || 'text/plain', size: file.size, text: String(r.result) });
      else resolve({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size, base64: String(r.result).split(',')[1] });
    };
    r.onerror = () => reject(r.error);
    if (isText) r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

export function download(name, content, mime = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---- Charts (canvas, theme-aware) ----

// series: [{ values: number[], color: '--accent', label }]
export function lineChart(canvas, series, { format = money, height = 160, labels = null, zeroLine = true } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || canvas.parentElement.clientWidth || 300;
  canvas.style.height = `${height}px`;
  canvas.width = w * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const col = (v) => (v.startsWith('--') ? css.getPropertyValue(v).trim() : v);
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const max = Math.max(1, ...all), min = Math.min(0, ...all);
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const pad = { l: 56, r: 8, t: 8, b: labels ? 18 : 6 };
  const x = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = col('--muted');
  ctx.strokeStyle = col('--border');
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const v = min + ((max - min) * i) / 3;
    ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(w - pad.r, y(v)); ctx.stroke();
    ctx.fillText(format(v), 2, y(v) + 4);
  }
  if (zeroLine && min < 0) {
    ctx.strokeStyle = col('--bad');
    ctx.beginPath(); ctx.moveTo(pad.l, y(0)); ctx.lineTo(w - pad.r, y(0)); ctx.stroke();
  }
  if (labels) {
    ctx.fillStyle = col('--muted');
    ctx.fillText(labels[0] ?? '', pad.l, height - 4);
    const last = labels.at(-1) ?? '';
    ctx.fillText(last, w - pad.r - ctx.measureText(last).width, height - 4);
  }
  for (const s of series) {
    ctx.strokeStyle = col(s.color ?? '--accent');
    ctx.lineWidth = 2;
    ctx.beginPath();
    s.values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.stroke();
  }
}

export function barChart(canvas, values, { format = money, height = 140, color = '--accent', negColor = '--bad', labels = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  canvas.style.height = `${height}px`;
  canvas.width = w * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const max = Math.max(1, ...values), min = Math.min(0, ...values);
  const pad = { l: 56, r: 4, t: 6, b: labels ? 18 : 4 };
  const bw = (w - pad.l - pad.r) / Math.max(1, values.length);
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = col('--muted');
  ctx.fillText(format(max), 2, y(max) + 10);
  if (min < 0) ctx.fillText(format(min), 2, y(min));
  values.forEach((v, i) => {
    ctx.fillStyle = col(v < 0 ? negColor : color);
    const top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
    ctx.fillRect(pad.l + i * bw + 1, top, Math.max(1, bw - 2), Math.max(1, h));
  });
  if (labels) {
    ctx.fillStyle = col('--muted');
    labels.forEach((l, i) => { if (l) ctx.fillText(l, pad.l + i * bw, height - 4); });
  }
}
