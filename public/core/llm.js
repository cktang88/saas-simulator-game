// LLM client (OpenRouter via the local /api/llm proxy).
//
// Every call names a task, asks for JSON matching a schema, and supplies a `fallback` function that
// produces a deterministic heuristic answer. The fallback is used when no API key is configured or a
// call fails, so the game is fully playable offline; results are flagged `mock: true` so the UI can say so.
//
// panel() asks several models (default Claude Haiku 5.5 + TypeSafe Jev Router) the same question so
// judgments don't hinge on one model's quirks.

import { LLM } from './params.js';
import { hash } from './util.js';

const SETTINGS_KEY = 'saas-sim-llm-settings';
let settingsCache = null;
let baseUrl = '';
let usageSink = null;
let serverKey = null;

export function configure({ base = '', onUsage = null } = {}) {
  baseUrl = base;
  usageSink = onUsage;
}

export function getSettings() {
  if (settingsCache) return settingsCache;
  let s = {};
  try { s = JSON.parse(globalThis.localStorage?.getItem(SETTINGS_KEY) ?? '{}'); } catch {}
  settingsCache = { apiKey: '', models: LLM.defaultModels.slice(), enabled: true, ...s };
  return settingsCache;
}

export function setSettings(patch) {
  settingsCache = { ...getSettings(), ...patch };
  try { globalThis.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settingsCache)); } catch {}
  return settingsCache;
}

export async function checkServerKey() {
  try {
    const r = await fetch(`${baseUrl}/api/status`);
    serverKey = (await r.json()).serverKey;
  } catch { serverKey = false; }
  return serverKey;
}

export const isLive = () => getSettings().enabled && Boolean(getSettings().apiKey || serverKey);

// Simple concurrency gate so a burst of jobs doesn't fire 50 requests at once.
let active = 0;
const waiters = [];
async function gate(fn) {
  if (active >= LLM.maxConcurrent) await new Promise((r) => waiters.push(r));
  active++;
  try { return await fn(); } finally { active--; waiters.shift()?.(); }
}

function parseJson(text) {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Model did not return JSON');
}

function buildContent(prompt, files = []) {
  if (!files.length) return prompt;
  const parts = [{ type: 'text', text: prompt }];
  for (const f of files) {
    if (f.mime?.startsWith('image/')) parts.push({ type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.base64}` } });
    else if (f.mime === 'application/pdf') parts.push({ type: 'file', file: { filename: f.name, file_data: `data:application/pdf;base64,${f.base64}` } });
    else if (f.text) parts.push({ type: 'text', text: `--- ${f.name} ---\n${f.text.slice(0, 40000)}` });
  }
  return parts;
}

/**
 * ask({ task, model, system, prompt, files, schema, temperature, maxTokens, fallback, cache })
 * → { data, mock, model, usd, error }
 *
 * - schema: JSON Schema for the response object (sent as response_format json_schema).
 * - fallback: () => data. Required. Must return the same shape as the schema.
 * - cache: optional state.cache object; identical requests return the cached result.
 */
/**
 * web: true → OpenRouter web search plugin (real-time results; costs ~$0.02 per request on top of tokens).
 * Returned citations: [{ url, title }] from the model's url_citation annotations.
 */
export async function ask({ task, model, system, prompt, files = [], schema, temperature = 0.7, maxTokens = 1200, fallback, cache = null, web = false, webResults = 8 }) {
  model ??= getSettings().models[0];
  const key = cache ? `${task}:${model}:${hash(JSON.stringify([system, prompt, files.map((f) => f.name + (f.base64?.length ?? f.text?.length)), schema]))}` : null;
  if (key && cache[key]) return { ...cache[key], cached: true };

  const offline = (error = null) => {
    usageSink?.({ mock: true, task, model });
    return { data: fallback(), mock: true, model, usd: 0, error, citations: [] };
  };
  if (!isLive()) return offline();

  const body = {
    model,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: buildContent(prompt, files) },
    ],
    temperature,
    max_tokens: maxTokens,
    ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: task.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 60), strict: true, schema } } } : {}),
  };
  const plugins = [
    ...(files.some((f) => f.mime === 'application/pdf') ? [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] : []),
    ...(web ? [{ id: 'web', max_results: webResults }] : []),
  ];
  if (plugins.length) body.plugins = plugins;
  try {
    const res = await gate(() => fetch(`${baseUrl}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(getSettings().apiKey ? { 'X-OpenRouter-Key': getSettings().apiKey } : {}) },
      body: JSON.stringify(body),
    }));
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message ?? json.error ?? `HTTP ${res.status}`);
    const msg = json.choices?.[0]?.message ?? {};
    const data = parseJson(msg.content);
    const usd = json.usage?.cost ?? 0;
    usageSink?.({ mock: false, task, model, usd });
    const citations = (msg.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => ({ url: a.url_citation?.url, title: a.url_citation?.title }));
    const out = { data, mock: false, model: json.model ?? model, usd, citations };
    if (key) cache[key] = out;
    return out;
  } catch (e) {
    console.warn(`[llm] ${task} on ${model} failed, using fallback:`, e.message);
    return offline(e.message);
  }
}

// Ask every configured panel model. Returns an array of results (one per model).
export async function panel(opts) {
  const models = opts.models ?? getSettings().models;
  return Promise.all(models.map((model) => ask({ ...opts, model })));
}

// Average numeric fields across panel results (ignores non-numbers).
export function averageField(results, field) {
  const vals = results.map((r) => r.data?.[field]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Shared instruction appended to every customer/investor role-play so models behave like real,
// busy, skeptical people instead of eager assistants.
export const REALISM = `You are role-playing a real person, not an assistant. Be as skeptical, busy and indifferent as real people are in 2026: inboxes are flooded with AI-written outreach, most products are ignored, and people rarely commit time or money. Never be polite for its own sake. Judge only what is actually in front of you; do not assume features or qualities that are not stated. Generic claims, buzzwords and vague benefits make you less interested, not more.`;
