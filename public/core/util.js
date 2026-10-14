// Small shared helpers. No DOM access here so it is usable from Node tests.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

// Mulberry32 PRNG driven by state.seed so a save replays deterministically.
export function rng(state) {
  let t = (state.seed = (state.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Integer from an expected value, keeping the fraction on average.
export const stochRound = (state, x) => Math.floor(x) + (rng(state) < x - Math.floor(x) ? 1 : 0);
// Poisson sample (Knuth for small means, normal approximation for large).
export function poisson(state, mean) {
  if (mean <= 0) return 0;
  if (mean > 50) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gaussian(state)));
  const L = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= rng(state); } while (p > L);
  return k - 1;
}
export function gaussian(state) {
  const u = Math.max(1e-9, rng(state)), v = rng(state);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export const pick = (state, arr) => arr[Math.floor(rng(state) * arr.length)];
export const chance = (state, p) => rng(state) < p;

// Ids come from a counter (no wall clock, no Math.random) so a seeded game replays identically. The counter is
// saved with the game (state.idCounter) and restored on load, so ids stay unique across sessions.
let idCounter = 0;
export const uid = (prefix = 'id') => `${prefix}_${(idCounter++).toString(36)}`;
export const getIdCounter = () => idCounter;
export const setIdCounter = (n) => { if (Number.isFinite(n) && n > idCounter) idCounter = n; };

// FNV-1a hash for caching LLM results by input.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---- Money & dates ----

export function money(n, { cents = false } = {}) {
  if (n == null || !Number.isFinite(n)) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (cents) return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e5) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  if (a >= 1e4) return `${sign}$${(a / 1e3).toFixed(1)}k`;
  return `${sign}$${Math.round(a).toLocaleString('en-US')}`;
}
export const pct = (n, d = 1) => (n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(d)}%`);
export const round2 = (n) => Math.round(n * 100) / 100;

const DAY_MS = 86400000;
// Day 0 is the game's start date (a Monday). All simulation time is in whole days.
export const dateOf = (state, day = state.day) => new Date(Date.parse(state.startDate + 'T12:00:00Z') + day * DAY_MS);
export const isoDate = (state, day = state.day) => dateOf(state, day).toISOString().slice(0, 10);
export const fmtDate = (state, day = state.day) => dateOf(state, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const dayOfWeek = (state, day = state.day) => dateOf(state, day).getUTCDay(); // 0 = Sunday
export const dayOfMonth = (state, day = state.day) => dateOf(state, day).getUTCDate();
export const monthIndex = (state, day = state.day) => dateOf(state, day).getUTCMonth();
export const isWeekend = (state, day = state.day) => [0, 6].includes(dayOfWeek(state, day));
export const isLastDayOfMonth = (state, day = state.day) => dayOfMonth(state, day + 1) === 1;
export const monthKey = (state, day = state.day) => isoDate(state, day).slice(0, 7);

// ---- CSV ----

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export const escapeHtml = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
export const domainOf = (s) => {
  try { return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, ''); } catch { return ''; }
};
export const words = (s) => String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
