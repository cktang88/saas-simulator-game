// Guardrails for running server.js as a PUBLIC proxy (the hosted default on Fly: PUBLIC_PROXY=1).
// The operator's OPENROUTER_API_KEY pays for every player who has no key, so a public proxy must not be an open
// OpenRouter relay. When PUBLIC_PROXY is on:
//   - CORS: only ALLOWED_ORIGINS (e.g. https://you.github.io) may call /api/* from a browser; other origins get 403.
//   - Only the game's own models (ALLOWED_MODELS, default: params.js chat models + the decision model) on the server key.
//   - Request shape is clamped: max_tokens, web plugin (Exa, max 10 results), no other plugins or tools.
//   - Per-IP rate (IP_RPM requests/min) and spend (IP_DAILY_USD per UTC day), plus a global DAILY_BUDGET_USD.
//     Spend is the real usage.cost OpenRouter reports, persisted to SPEND_FILE so a restart doesn't reset it.
//   - Clients cannot write the shared disk cache (PUT /api/cache is refused); the server caches replies itself.
// A player who sends their own key (X-OpenRouter-Key) bypasses the budgets and model list: they pay.
// Without PUBLIC_PROXY (npm start on your machine) nothing here applies except CORS: same-origin pages, non-browser
// clients and ALLOWED_ORIGINS may call /api/*; other browser origins are refused (no cross-site spending of your key).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LLM } from './public/core/params.js';

const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
const list = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);

export function guardConfig(env = process.env) {
  return {
    isPublic: env.PUBLIC_PROXY === '1' || env.PUBLIC_PROXY === 'true',
    origins: list(env.ALLOWED_ORIGINS),
    models: list(env.ALLOWED_MODELS).length ? list(env.ALLOWED_MODELS) : [...LLM.defaultModels, LLM.decisionModel],
    dailyBudgetUsd: num(env.DAILY_BUDGET_USD, 5),
    ipDailyUsd: num(env.IP_DAILY_USD, 0.5),
    ipRpm: num(env.IP_RPM, 30),
    maxTokens: num(env.MAX_TOKENS_CAP, 16000),
    maxWebResults: 10,
    decideUsd: num(env.DECIDE_EST_USD, 0.002), // [design] the decisions API reports no cost; charge a small estimate
    spendFile: env.SPEND_FILE || null,
    // Which header carries the real client IP. 'fly' (fly.toml): only Fly-Client-IP, set by Fly's edge and not
    // spoofable there. 'xff': first X-Forwarded-For hop (only behind a proxy that overwrites it). Unset/'none': the
    // socket address. Trusting a header the host doesn't overwrite lets a client fake its IP and dodge per-IP caps.
    trustProxy: ['fly', 'xff'].includes(String(env.TRUST_PROXY ?? '').trim().toLowerCase()) ? String(env.TRUST_PROXY).trim().toLowerCase() : 'none',
    reserveUsd: num(env.RESERVE_EST_USD, 0.02), // [design] held per in-flight server-key call until its real cost is known
  };
}

const today = (now) => new Date(now).toISOString().slice(0, 10);

export class ProxyGuard {
  constructor(config = guardConfig(), { now = () => Date.now() } = {}) {
    this.c = config;
    this.now = now;
    this.hits = new Map(); // ip -> request times in the last minute
    this.held = { total: 0, byIp: {} }; // in-flight reservations (spend not yet reported), see reserve()
    this.spend = { day: today(now()), total: 0, byIp: {} };
    if (config.spendFile) { try { const s = JSON.parse(readFileSync(config.spendFile, 'utf8')); if (s.day === this.spend.day) this.spend = s; } catch { /* fresh */ } }
  }

  /** Client IP per TRUST_PROXY: Fly-Client-IP ('fly'), first X-Forwarded-For ('xff'), else the socket address. */
  ip(req) {
    const sock = req.socket?.remoteAddress || 'unknown';
    if (this.c.trustProxy === 'fly') return String(req.headers['fly-client-ip'] || '').trim() || sock;
    if (this.c.trustProxy === 'xff') return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || sock;
    return sock;
  }

  /** Set CORS headers. → false when this browser origin must be refused. Non-browser calls (no Origin) pass.
   *  The page this server serves itself (same origin) always passes. Any OTHER origin not in ALLOWED_ORIGINS is refused
   *  even locally: a "simple" cross-site POST (Content-Type text/plain, no preflight) would otherwise let any web page
   *  the player visits spend the OPENROUTER_API_KEY of their `npm start` server (CSRF), even though it can't read the reply. */
  cors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true; // curl, server-to-server: budgets still apply
    const ok = this.c.origins.includes(origin) || this.c.origins.includes('*');
    let same = false;
    try { same = new URL(origin).host === String(req.headers.host ?? '').toLowerCase(); } catch { /* "null" or junk */ }
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', this.c.origins.includes('*') ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Key, X-Disk-Cache');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    return ok || same;
  }

  rollDay() {
    const d = today(this.now());
    if (this.spend.day !== d) this.spend = { day: d, total: 0, byIp: {} };
  }

  /** Rate and budget check before spending the server key. → null (ok) or { status, error }. */
  check(ip) {
    if (!this.c.isPublic) return null;
    this.rollDay();
    const t = this.now();
    const h = (this.hits.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (h.length >= this.c.ipRpm) { this.hits.set(ip, h); return { status: 429, error: `Too many requests from your connection (limit ${this.c.ipRpm} a minute). Wait a moment, or use your own OpenRouter key in Settings.` }; }
    h.push(t); this.hits.set(ip, h);
    if (this.hits.size > 50_000) this.evictHits(t); // memory bound without resetting active IPs' counters
    return this.budgetBlock(ip);
  }

  /** Drop IPs with no request in the last minute; if still over the bound, drop the oldest-seen ones. */
  evictHits(t) {
    for (const [k, v] of this.hits) if (!v.length || t - v[v.length - 1] >= 60_000) this.hits.delete(k);
    if (this.hits.size <= 50_000) return;
    const byLast = [...this.hits].sort((a, b) => a[1][a[1].length - 1] - b[1][b[1].length - 1]);
    for (const [k] of byLast.slice(0, this.hits.size - 40_000)) this.hits.delete(k);
  }

  /** Hold an estimated cost for one in-flight server-key call, so concurrent calls can't all pass the budget check
   *  before any of them is charged. → a hold to pass to release() once the real cost is charged (or the call fails). */
  reserve(ip, usd = this.c.reserveUsd) {
    if (!this.c.isPublic || !(usd > 0)) return null;
    this.rollDay();
    this.held.total += usd;
    this.held.byIp[ip] = (this.held.byIp[ip] ?? 0) + usd;
    return { ip, usd, day: this.spend.day };
  }

  release(hold) {
    if (!hold || hold.done) return;
    hold.done = true;
    this.held.total = Math.max(0, this.held.total - hold.usd);
    const left = (this.held.byIp[hold.ip] ?? 0) - hold.usd;
    if (left > 1e-12) this.held.byIp[hold.ip] = left; else delete this.held.byIp[hold.ip];
  }

  /** Budget-only check (no rate counting), e.g. before the background research worker spends the server key. */
  budgetBlock(ip) {
    if (!this.c.isPublic) return null;
    this.rollDay();
    if (this.spend.total + this.held.total >= this.c.dailyBudgetUsd) return { status: 429, budget: true, error: 'The hosted AI proxy has used today\'s budget. Use your own OpenRouter key in Settings (Connection), or play offline until tomorrow (UTC).' };
    if (ip != null && (this.spend.byIp[ip] ?? 0) + (this.held.byIp[ip] ?? 0) >= this.c.ipDailyUsd) return { status: 429, budget: true, error: `You've used today's free hosted AI allowance ($${this.c.ipDailyUsd.toFixed(2)}). Add your own OpenRouter key in Settings (Connection) to keep playing live, or continue offline.` };
    return null;
  }

  /** Record real spend on the server key. */
  charge(ip, usd) {
    if (!this.c.isPublic || !(usd > 0)) return;
    this.rollDay();
    this.spend.total += usd;
    this.spend.byIp[ip] = (this.spend.byIp[ip] ?? 0) + usd;
    this.persist();
  }

  persist() {
    if (!this.c.spendFile || this._pending) return;
    this._pending = setTimeout(() => {
      this._pending = null;
      try { mkdirSync(dirname(this.c.spendFile), { recursive: true }); writeFileSync(this.c.spendFile, JSON.stringify(this.spend)); } catch { /* best effort */ }
    }, 2000);
    this._pending.unref?.();
  }

  /** Clamp a chat-completion payload sent on the server key. → null (ok) or an error string. Mutates payload. */
  sanitizeLlm(p) {
    if (!this.c.isPublic) return null;
    if (!this.c.models.includes(p.model)) return `Model "${p.model}" is not available on the hosted proxy (allowed: ${this.c.models.join(', ')}). Use your own key for other models.`;
    p.max_tokens = Math.min(Math.max(1, Number(p.max_tokens) || 1200), this.c.maxTokens);
    if (Array.isArray(p.plugins)) {
      p.plugins = p.plugins.filter((x) => x?.id === 'web' || x?.id === 'file-parser').map((x) => (x.id === 'web'
        ? { id: 'web', engine: 'exa', mode: ['instant', 'fast', 'auto', 'deep-lite', 'deep'].includes(x.mode) ? x.mode : 'auto', max_results: Math.min(this.c.maxWebResults, Math.max(1, Number(x.max_results) || 5)) }
        : { id: 'file-parser', pdf: { engine: 'pdf-text' } }));
    }
    delete p.tools;
    return null;
  }

  sanitizeDecide(p) {
    if (!this.c.isPublic) return null;
    return this.c.models.includes(p.model) ? null : `Decision model "${p.model}" is not available on the hosted proxy.`;
  }

  status(ip) {
    if (!this.c.isPublic) return { public: false };
    this.rollDay();
    return { public: true, limits: { ipDailyUsd: this.c.ipDailyUsd, ipSpentUsd: Math.round((this.spend.byIp[ip] ?? 0) * 1000) / 1000, dailyBudgetUsd: this.c.dailyBudgetUsd, budgetLeft: this.spend.total < this.c.dailyBudgetUsd, ipRpm: this.c.ipRpm, models: this.c.models } };
  }
}
