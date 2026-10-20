// "How this works" box shown at the top of a tool: what the tool does, what moves the odds (the levers the
// simulation reads, not advice on what to decide), what it costs in founder hours and money, and what happens next
// and when. Open by default while the tool is unused, collapsed once the founder has used it. Pure markup.

import { html } from './ui.js';

/**
 * @param {{ title?: string, how: any, levers?: any, cost?: any, next?: any, open?: boolean, steps?: Array<[string, boolean, string?]> }} o
 *   steps: optional live checklist rows [label, done, href?]
 */
export function howTo({ title = 'How this works', how, levers, cost, next, open = false, steps = null }) {
  return html`<details class="howto" ${open ? 'open' : ''}><summary>${title}</summary>
    <div class="howto-body">
      <p>${how}</p>
      ${steps?.length ? html`<ol class="howto-steps">${steps.map(([label, done, href]) => html`<li class="${done ? 'done' : ''}">${done ? '✓ ' : ''}${href && !done ? html`<a href="${href}">${label}</a>` : label}</li>`)}</ol>` : ''}
      <dl>
        ${levers ? html`<dt>What moves the odds</dt><dd>${levers}</dd>` : ''}
        ${cost ? html`<dt>What it costs</dt><dd>${cost}</dd>` : ''}
        ${next ? html`<dt>What happens next</dt><dd>${next}</dd>` : ''}
      </dl>
    </div></details>`;
}
