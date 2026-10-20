// The OpenRouter key field shared by the setup screen and Settings: show/hide, Test key, status line, Forget key,
// and copy that says exactly where the key goes in the current mode (server proxy vs straight to openrouter.ai).

import { html, raw } from './ui.js';
import { getSettings, setSettings } from './llm.js';
import { isStatic, testKey } from './transport.js';

export const KEYS_URL = 'https://openrouter.ai/settings/keys';

export function keyPrivacyText() {
  return isStatic()
    ? 'Your key is saved only in this browser (localStorage) and is sent only from this browser to openrouter.ai, never to this site or anyone else. Create a key with a low credit limit for the game. Anyone with access to this browser profile can read it; use Forget key on a shared computer.'
    : 'Your key is saved only in this browser and sent only to the local server that serves this page, which forwards it to openrouter.ai. You can also set OPENROUTER_API_KEY when starting the server.';
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
    if (!key && isStatic()) { status.textContent = 'Enter a key first.'; return; }
    e.target.disabled = true; status.textContent = 'Checking with OpenRouter…';
    const r = await testKey(key, { model: getSettings().models?.[0] });
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
