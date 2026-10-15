// Shared view helpers for Search & AI visibility (also used by Organic's keyword box).

import { html } from '../../core/ui.js';

/** Render a keywordInsight() result: only what the player's tools can actually see. */
export function kwInsightHtml(k) {
  if (!k || !k.source) return html`<p class="small muted">${k?.note ?? ''}</p>`;
  const intent = k.commercial ? 'commercial intent' : 'informational: expect an AI Overview';
  if (k.source === 'gsc') return html`<p class="small">Your page: <b>${k.impressions.toLocaleString()}</b> impressions, ${Math.round(k.clicks)} clicks, avg position ${k.position?.toFixed(1)} · ${intent}</p><p class="small muted">${k.note}</p>`;
  if (k.source === 'planner') return html`<p class="small">Volume <b>${k.range}/mo</b> · difficulty unknown · ${intent}</p><p class="small muted">${k.note}</p>`;
  return html`<p class="small">Est. volume <b>${k.zero ? '0-10' : k.volume.toLocaleString()}/mo</b> · KD <b>${k.kd}</b> (${k.tier === 'long' ? 'long-tail' : k.tier === 'mid' ? 'medium' : 'competitive'}) · ${intent}</p>
    ${(k.others ?? []).map((o) => html`<p class="small">${o.label}: ${o.zero ? '0-10' : o.volume.toLocaleString()}/mo · KD ${o.kd}</p>`)}<p class="small muted">${k.note}</p>`;
}
