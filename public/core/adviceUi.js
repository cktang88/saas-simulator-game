// Shared renderer for gated advice (docs/design/advice-sources.md). Views pass the TRUE lines; only what the player's
// recruited sources (or learning mode) would say comes out, tagged with who said it. Never renders quality/truth/biased.
import { html } from './ui.js';
import { adviceFor } from './advice.js';

/** Gated advice items as html: [] when no source covers the function. opts: { kind, cls }. */
export function adviceBlock(state, functionId, lines, opts = {}) {
  const { kind = 'coaching', cls = 'small muted' } = opts;
  const items = adviceFor(state, functionId, lines, { kind });
  if (!items.length) return '';
  return html`<ul class="${cls}">${items.map((a) => html`<li>${a.text} <span class="muted">(${a.from})</span></li>`)}</ul>`;
}
