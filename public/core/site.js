// Fetch a public web page for the game (prospect research, judging your landing page).
//   server mode: POST ./api/site (the local server fetches the page, SSRF-guarded, and extracts readable text).
//   static mode: browsers cannot fetch arbitrary sites (CORS), so the player's own OpenRouter key asks a web-enabled
//     model (OpenRouter's web plugin) to retrieve and summarise the public page. Cached in state.cache. With no key
//     there is no honest way to read a page, so the caller gets { offline: true } and uses its offline path.
// Both modes resolve to a fetch Response whose JSON is { url, title, description, headings, emails, text } or { error }.

import { ask, isLive, getSettings } from './llm.js';
import { isStatic, apiUrl } from './transport.js';
import { assertPublicUrlStatic } from './netguard.js';

const respond = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

const SITE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['found', 'title', 'description', 'headings', 'emails', 'text'],
  properties: {
    found: { type: 'boolean' }, title: { type: 'string' }, description: { type: 'string' },
    headings: { type: 'array', items: { type: 'string' } }, emails: { type: 'array', items: { type: 'string' } },
    text: { type: 'string' },
  },
};

export const SITE_SYSTEM = 'You retrieve public web pages for a research tool. Use web search to find the page or site the user names. Report only what the retrieved sources actually say about that site; never invent content. If you cannot find it, return found=false and empty strings.';

export const sitePrompt = (href) => `Retrieve the public page at ${href} (search for its domain and read the page or the closest pages from that site). Return JSON {"found": boolean, "title": page title, "description": meta or lead description, "headings": up to 20 main headings, "emails": public contact emails shown on the site, "text": the readable main text, at most 4000 characters, verbatim or tightly condensed}.`;

/** fetchSite(url, { cache }) → Response. cache: state.cache (static mode caches the result there). */
export async function fetchSite(url, { cache = null } = {}) {
  if (!isStatic()) {
    return fetch(apiUrl('api/site'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  }
  let target;
  try { target = assertPublicUrlStatic(String(url ?? '').trim()); } catch (e) { return respond(e.status ?? 400, { error: e.message }); }
  if (!isLive() || !getSettings().apiKey) {
    return respond(503, { offline: true, error: 'Reading other websites from a browser needs an OpenRouter key (Settings). Without one, paste the page copy or upload its HTML instead.' });
  }
  const res = await ask({
    task: 'site_fetch', system: SITE_SYSTEM, prompt: sitePrompt(target.href), schema: SITE_SCHEMA,
    temperature: 0, maxTokens: 2500, web: true, webResults: 3, cache,
    fallback: () => ({ found: false, title: '', description: '', headings: [], emails: [], text: '' }),
  });
  const d = res.data ?? {};
  if (res.mock) return respond(502, { error: `Could not fetch ${target.hostname} through OpenRouter${res.error ? ` (${res.error})` : ''}.` });
  if (!d.found || !(d.text || d.title)) return respond(502, { error: `The web search could not retrieve ${target.hostname}.` });
  return respond(200, {
    url: target.href, title: String(d.title ?? '').slice(0, 300), description: String(d.description ?? '').slice(0, 500),
    headings: (d.headings ?? []).map(String).slice(0, 25), emails: (d.emails ?? []).map(String).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 10),
    text: String(d.text ?? '').slice(0, 20000), via: 'openrouter-web',
  });
}
