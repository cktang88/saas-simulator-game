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
// Without PUBLIC_PROXY (npm start on your machine) nothing here applies, except CORS for ALLOWED_ORIGINS if set.

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
  };
}

const today = (now) => new Date(now).toISOString().slice(0, 10);

export class ProxyGuard {
  constructor(config = guardConfig(), { now = () => Date.now() } = {}) {
    this.c = config;
    this.now = now;
    this.hits = new Map(); // ip -> request times in the last minute
    this.spend = { day: today(now()), total: 0, byIp: {} };
    if (config.spendFile) { try { const s = JSON.parse(readFileSync(config.spendFile, 'utf8')); if (s.day === this.spend.day) this.spend = s; } catch { /* fresh */ } }
  }

  /** Client IP behind Fly's proxy (Fly-Client-IP), a generic proxy (first X-Forwarded-For), or the socket. */
  ip(req) {
    return String(req.headers['fly-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown');
  }

  /** Set CORS headers. → false when a public proxy must refuse this browser origin. Non-browser calls (no Origin) pass. */
  cors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true; // curl, server-to-server: budgets still apply
    const ok = this.c.origins.includes(origin) || this.c.origins.includes('*');
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', this.c.origins.includes('*') ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-OpenRouter-Key, X-Disk-Cache');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    return ok || !this.c.isPublic;
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
    if (this.hits.size > 50_000) this.hits.clear(); // memory bound
    if (this.spend.total >= this.c.dailyBudgetUsd) return { status: 429, budget: true, error: 'The hosted AI proxy has used today\'s budget. Use your own OpenRouter key in Settings (Connection), or play offline until tomorrow (UTC).' };
    if ((this.spend.byIp[ip] ?? 0) >= this.c.ipDailyUsd) return { status: 429, budget: true, error: `You've used today's free hosted AI allowance ($${this.c.ipDailyUsd.toFixed(2)}). Add your own OpenRouter key in Settings (Connection) to keep playing live, or continue offline.` };
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
