// The OpenRouter key field shared by the setup screen and Settings: show/hide, Test key, status line, Forget key,
// and copy that says exactly where the key goes in the current mode (server proxy vs straight to openrouter.ai).

import { html, raw } from './ui.js';
import { getSettings, setSettings, getConnectionInfo } from './llm.js';
import { isStatic, testKey, getConnection, sendsKey } from './transport.js';

export const KEYS_URL = 'https://openrouter.ai/settings/keys';

export function keyPrivacyText() {
  // A "your own server" URL that answers /api/status with public:true is a public proxy: the key is withheld from it.
  if (!isStatic() && getConnection() === 'selfhost' && (getConnectionInfo()?.public || !sendsKey())) {
    return 'The server you pointed at says it is a public proxy, so your key is NOT sent to it; it is kept only in this browser and calls there use that server\'s own allowance. To use your key, pick "Your own OpenRouter key" (straight to openrouter.ai) or a server you run without PUBLIC_PROXY.';
  }
  return isStatic() || getConnection() !== 'selfhost'
    ? 'Your key is saved only in this browser (localStorage) and is sent only from this browser to openrouter.ai, never to this site or anyone else. Create a key with a low credit limit for the game. Anyone with access to this browser profile can read it; use Forget key on a shared computer.'
    : 'Your key is saved only in this browser and sent only to your own server, which forwards it to openrouter.ai (with "Your own OpenRouter key" it goes straight to openrouter.ai instead). You can also set OPENROUTER_API_KEY when starting the server. It is never sent to the hosted proxy.';
}

/** The field markup. name="apiKey" so it submits with the surrounding form. */
export function keyField({ value = getSettings().apiKey, optional = false } = {}) {
  return html`<div class="key-field">
    <label>OpenRouter API key${optional ? ' (optional)' : ''}
      <span class="inline"><input name="apiKey" id="apiKeyInput" type="password" autocomplete="off" spellcheck="false" value="${value}" placeholder="sk-or-v1-…" />
      <button type="button" id="keyShow" aria-pressed="false">Show</button><button type="button" id="keyTest">Test key</button>${value ? html`<button type="button" id="keyForget" class="danger">Forget key</button>` : ''}</span>
    </label>
    <p class="small muted" id="keyStatus" role="status">${value ? 'A key is saved in this browser.' : raw(`No key: the game uses offline judges. Get one at <a href="${KEYS_URL}" target="_blank" rel="noopener">openrouter.ai/settings/keys</a>.`)}</p>
    <p class="small muted">${keyPrivacyText()}</p>
  </div>`;
}

/** Wire the buttons inside `root`. onForget runs after the key is removed (e.g. re-render). */
export function bindKeyField(root, { onForget = null } = {}) {
  const input = root.querySelector('#apiKeyInput');
  const status = root.querySelector('#keyStatus');
  if (!input) return;
  root.querySelector('#keyShow')?.addEventListener('click', (e) => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.target.textContent = show ? 'Hide' : 'Show';
    e.target.setAttribute('aria-pressed', String(show));
  });
  root.querySelector('#keyTest')?.addEventListener('click', async (e) => {
    const key = input.value.trim();
    const picked = root.querySelector('input[name="connection"]:checked')?.value;
    const direct = picked ? picked === 'byok' : isStatic(); // the choice on screen, even before it is saved
    if (!key && direct) { status.textContent = 'Enter a key first.'; return; }
    e.target.disabled = true; status.textContent = 'Checking with OpenRouter…';
    const r = await testKey(key, { model: getSettings().models?.[0], direct });
    e.target.disabled = false;
    status.textContent = `${r.status === 'valid' ? 'OK: ' : r.status === 'invalid' ? 'Invalid key: ' : 'Could not check: '}${r.detail}`;
    status.className = `small ${r.status === 'valid' ? 'pos' : 'neg'}`;
  });
  root.querySelector('#keyForget')?.addEventListener('click', () => {
    setSettings({ apiKey: '' });
    input.value = '';
    status.textContent = 'Key removed from this browser.';
    onForget?.();
  });
}

// ---- Connection picker (Settings and the setup screen): hosted proxy (default), your own key, your own server, offline.
// Every live option gets the same models, the same Exa web search and the same judges; they differ only in who pays
// and where requests go.
export const CONNECTION_INFO = {
  proxy: { label: 'Hosted AI (recommended)', text: 'Free to try: our server calls OpenRouter for you, with a daily allowance per player. Nothing to set up.' },
  byok: { label: 'Your own OpenRouter key', text: 'No allowance limits; you pay OpenRouter directly (typically cents per session). The key stays in this browser and goes only to openrouter.ai.' },
  selfhost: { label: 'Your own server', text: 'Run the game yourself (git clone, npm start) with your key in .env, or point this page at your server URL.' },
  offline: { label: 'Offline, no AI (not recommended)', text: 'Deterministic heuristics play every customer, prospect and investor. Much cruder judgments, no web research.' },
};

/** Radio cards + the fields each choice needs. `current` is the resolved connection when the setting is 'auto'. */
export function connectionField({ settings = getSettings(), current = 'proxy', compact = false } = {}) {
  const chosen = settings.enabled === false ? 'offline' : settings.connection && settings.connection !== 'auto' ? settings.connection : current;
  return html`<div class="connection-field">
    ${Object.entries(CONNECTION_INFO).map(([k, c]) => html`<label class="radio-card"><input type="radio" name="connection" value="${k}" ${k === chosen ? 'checked' : ''} /><b>${c.label}</b>${compact ? '' : html`<span>${c.text}</span>`}</label>`)}
    <div data-conn="byok selfhost">${keyField({ value: settings.apiKey, optional: true })}</div>
    <div data-conn="selfhost"><label>Server URL (blank: the server that served this page) <input name="serverUrl" value="${settings.serverUrl ?? ''}" placeholder="http://localhost:3000" /></label>
      <p class="small muted">A server on another address must allow this page's origin: start it with ALLOWED_ORIGINS=${globalThis.location?.origin ?? ''}.</p></div>
    <details data-conn="proxy"><summary class="small">Advanced: proxy address</summary><label>Hosted proxy URL (blank: default) <input name="proxyUrl" value="${settings.proxyUrl ?? ''}" placeholder="https://…fly.dev" /></label></details>
  </div>`;
}

/** Show only the fields the chosen connection needs. */
export function bindConnectionField(root) {
  const sync = () => {
    const v = root.querySelector('input[name="connection"]:checked')?.value ?? 'proxy';
    for (const el of root.querySelectorAll('[data-conn]')) el.hidden = !el.dataset.conn.split(' ').includes(v);
  };
  root.addEventListener('change', (e) => { if (e.target.name === 'connection') sync(); });
  sync();
}

/** Form values → settings patch. */
export const connectionPatch = (f) => ({
  connection: f.connection ?? 'auto',
  enabled: f.connection !== 'offline',
  apiKey: String(f.apiKey ?? '').trim(),
  serverUrl: String(f.serverUrl ?? '').trim(),
  proxyUrl: String(f.proxyUrl ?? '').trim(),
});
