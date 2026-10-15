// LLM client (OpenRouter via the local /api/llm proxy).
//
// Every call names a task, asks for JSON matching a schema, and supplies a `fallback` function that
// produces a deterministic heuristic answer. The fallback is used when no API key is configured or a
// call fails, so the game is fully playable offline; results are flagged `mock: true` so the UI can say so.
//
// Two kinds of model, each used for what it is built for:
// - Chat models (default Claude Haiku 5.5) write: role-play replies, feedback, quoted evidence. ask()/panel().
// - Jev (TypeSafe's System One model) decides: typed questions about a state, answered with probabilities
//   instead of text: `choice` (pick one option), `noul` (yes/no), `score` (position on an ordered scale).
//   decide(). A rubric-scored panel also asks Jev to score each criterion and blends it with the chat scores,
//   so a judgment rests on two independent signals. Never send Jev prose or role-play.

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
  settingsCache = normalize({ apiKey: '', models: LLM.defaultModels.slice(), decisionModel: LLM.decisionModel, enabled: true, ...s });
  return settingsCache;
}

// Saves from before the split listed a Jev model among the chat models; Jev only answers typed questions.
function normalize(s) {
  s.models = (s.models ?? []).filter((m) => !/jev/i.test(m));
  if (!s.models.length) s.models = LLM.defaultModels.slice();
  if (!/jev/i.test(s.decisionModel ?? '')) s.decisionModel = LLM.decisionModel;
  return s;
}

export function setSettings(patch) {
  settingsCache = normalize({ ...getSettings(), ...patch });
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
 * ask({ task, model, system, context, prompt, files, schema, temperature, maxTokens, fallback, cache })
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
export async function ask(opts) {
  if (!opts.rubric?.length) return askChat(opts);
  // Rubric judgment: the chat model scores and quotes evidence while Jev scores the same criteria; blend.
  const jevP = opts._jev ?? (isLive() ? scoreRubric({ task: opts.task, rubric: opts.rubric, context: `${opts.system ?? ''}${opts.context ?? ''}`, submission: opts.prompt, cache: opts.cache }) : null);
  const [r, jev] = await Promise.all([askChat(opts), jevP]);
  if (jev && !jev.mock && r.data) { blendRubric(r.data, opts.rubric, jev.scores); r.jev = jev.answers; }
  return r;
}

// Criterion scores live at the top level of the result or under `rubric`; average each with Jev's.
function blendRubric(data, rubric, scores) {
  for (const c of rubric) {
    const j = scores[c.key];
    if (!Number.isFinite(j)) continue;
    for (const obj of [data, data.rubric]) {
      if (obj && typeof obj === 'object' && Number.isFinite(obj[c.key])) { obj[c.key] = Math.round(((obj[c.key] + j) / 2) * 100) / 100; break; }
    }
  }
}

async function askChat({ task, model, system, context = '', prompt, files = [], schema, temperature = 0.7, maxTokens = 1200, fallback, cache = null, web = false, webResults = 8 }) {
  model ??= getSettings().models[0];
  if (context) system = `${system ?? ''}${context}`; // business facts (apps/context.js), appended so personas stay first
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

// Ask every configured chat model. Returns an array of results (one per model).
// rubric: [{ key, label, anchors }] (core/rubric.js). When given and live, Jev also scores each criterion on the
// same 1-5 scale and every result's numeric criterion fields become the mean of the chat score and Jev's
// probability-weighted score (result.jev holds Jev's raw answers). Result shapes are unchanged.
export async function panel(opts) {
  const models = opts.models ?? getSettings().models;
  // One Jev scoring shared by every chat model's answer.
  const _jev = opts.rubric?.length && isLive() ? scoreRubric({ task: opts.task, rubric: opts.rubric, context: `${opts.system ?? ''}${opts.context ?? ''}`, submission: opts.prompt, cache: opts.cache }) : null;
  return Promise.all(models.map((model) => ask({ ...opts, model, _jev })));
}

// ---------------------------------------------------------------------------
// Jev typed decisions
// ---------------------------------------------------------------------------

const clipText = (s, n) => { const t = typeof s === 'string' ? s : JSON.stringify(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };

/**
 * decide({ task, state, questions, fallback, cache }) → { answers, mock, model, usd, error }
 * - state: plain object of facts Jev reasons over (keep it under ~30 KB of text: larger runs slower and less accurate).
 * - questions: { id: { type: 'choice', instructions, criteria: { option: 'when to pick it' } }
 *                    | { type: 'noul', instructions, criteria: { true: '…', false: '…' } }
 *                    | { type: 'score', instructions, criteria: ['lowest level', …, 'highest level'] } }
 *   Questions are answered in parallel and can't see each other. Make each option concrete and distinguishable.
 * - answers: { id: { type:'choice', choice, confidence, probabilities } | { type:'noul', noul (P of yes) }
 *                  | { type:'score', score (0-based weighted position), confidence, probabilities } }
 * - fallback: () => answers in the same shape (deterministic heuristic). Required.
 * Confidence describes how spread the alternatives are, not whether acting is safe: pick thresholds from the
 * cost of each mistake.
 */
export async function decide({ task, state = {}, questions, fallback, cache = null }) {
  const model = getSettings().decisionModel ?? LLM.decisionModel;
  const key = cache ? `decide:${task}:${model}:${hash(JSON.stringify([state, questions]))}` : null;
  if (key && cache[key]) return { ...cache[key], cached: true };
  const offline = (error = null) => {
    usageSink?.({ mock: true, task, model });
    return { answers: fallback(), mock: true, model, usd: 0, error };
  };
  if (!isLive()) return offline();
  try {
    const res = await gate(() => fetch(`${baseUrl}/api/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(getSettings().apiKey ? { 'X-OpenRouter-Key': getSettings().apiKey } : {}) },
      body: JSON.stringify({ model, state, questions }),
    }));
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error?.message ?? json.error ?? `HTTP ${res.status}`);
    const answers = json.answers ?? {};
    for (const id of Object.keys(questions)) if (!answers[id]) throw new Error(`No answer for "${id}"`);
    const usd = json.usage?.cost ?? 0;
    usageSink?.({ mock: false, task, model, usd });
    const out = { answers, mock: false, model: json.model ?? model, usd };
    if (key) cache[key] = out;
    return out;
  } catch (e) {
    console.warn(`[llm] decide ${task} failed, using fallback:`, e.message);
    return offline(e.message);
  }
}

/** Rubric criteria → Jev score questions on a 5-level scale built from the 1/3/5 (or 0/2/4) anchors. */
const zeroBased = (c) => (typeof c.anchors === 'string' ? /(^|\s)0\s*[:=]/.test(c.anchors) : c.anchors && '0' in c.anchors);

export function rubricQuestions(rubric) {
  const levels = (c) => {
    if (zeroBased(c)) {
      const a = typeof c.anchors === 'string' ? {} : c.anchors;
      return [`0: ${a[0] ?? 'very weak'}`, '1: between 0 and 2', `2: ${a[2] ?? 'adequate'}`, '3: between 2 and 4', `4: ${a[4] ?? 'excellent'}`];
    }
    const a = typeof c.anchors === 'string'
      ? Object.fromEntries([...c.anchors.matchAll(/(?:^|\s)([135])\s*[:=]\s*([^]*?)(?=\s[135]\s*[:=]|$)/g)].map((m) => [m[1], m[2].trim().replace(/[.;|]\s*$/, '')]))
      : c.anchors ?? {};
    return [`1: ${a[1] ?? 'very weak'}`, '2: between 1 and 3', `3: ${a[3] ?? 'adequate'}`, '4: between 3 and 5', `5: ${a[5] ?? 'excellent'}`];
  };
  return Object.fromEntries(rubric.map((c) => [c.key, { type: 'score', instructions: `Rate the submission on: ${c.label}. Judge only what is in the submission; anything missing counts as low.`, criteria: levels(c) }]));
}

/** Ask Jev to score a submission on every rubric criterion. → { scores: { key: 1..5 }, answers, mock } */
export async function scoreRubric({ task, rubric, context = '', submission = '', cache = null }) {
  const r = await decide({
    task: `${task}:rubric`,
    state: { judging_context: clipText(context, 12000), submission: clipText(submission, 16000) },
    questions: rubricQuestions(rubric),
    fallback: () => ({}),
    cache,
  });
  const scores = {};
  for (const c of rubric) {
    const a = r.answers?.[c.key];
    if (a && Number.isFinite(a.score)) scores[c.key] = Math.round((a.score + (zeroBased(c) ? 0 : 1)) * 100) / 100; // 0-based → rubric scale
  }
  return { scores, answers: r.answers, mock: r.mock || !Object.keys(scores).length };
}

// Average numeric fields across panel results (ignores non-numbers).
export function averageField(results, field) {
  const vals = results.map((r) => r.data?.[field]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Shared instruction appended to every customer/investor role-play so models behave like real,
// busy, skeptical people instead of eager assistants.
export const REALISM = `You are role-playing a real person, not an assistant. Be as skeptical, busy and indifferent as real people are in 2026: inboxes are flooded with AI-written outreach, most products are ignored, and people rarely commit time or money. Never be polite for its own sake. Judge only what is actually in front of you; do not assume features or qualities that are not stated. Generic claims, buzzwords and vague benefits make you less interested, not more.`;
