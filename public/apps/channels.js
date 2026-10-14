// Channels & partnerships: every non-ad acquisition channel a 2026 founder actually uses — affiliates,
// customer referrals, integration marketplaces & app stores (incl. ChatGPT apps and Claude connectors),
// resellers/agencies, co-marketing & webinars, events, PR, podcast/YouTube sponsorships, review sites &
// directories, free tools & PLG loops, lifetime deals, cold calling, direct mail and AI-search visibility.
// Each channel uses the CHANNELS research numbers (public/data/channels.js): setup hours and cost, time to
// first result, ramp, steady-state volume with noise, conversion, fees. The player writes the actual
// outreach, listings, pitches and ad reads; an LLM panel judges them (offline heuristic fallback).
//
// Paid ads, SEO, communities, Product Hunt, newsletter sponsorships and word of mouth live in Ads/Organic.

import { html, mount } from '../core/ui.js';
import { ensureChannels, channelsDay } from './channels/sim.js';
import { css } from './channels/ui-common.js';
import { overview, performance, affiliates, referrals, marketplaces, partners, comarketing } from './channels/views-a.js';
import { events, pr, sponsors, reviews, tools, ltd, direct, ai } from './channels/views-b.js';

const TABS = [overview, performance, affiliates, referrals, marketplaces, partners, comarketing, events, pr, sponsors, reviews, tools, ltd, direct, ai];
const tabsFor = (state) => TABS.filter((t) => !t.models || t.models.includes(state.company.model));

// Things that need the founder soon (interviews, event leads going cold, rejected listings, partner replies).
export function urgent(state) {
  const C = state.apps.channels;
  if (!C?.pr) return 0;
  let n = 0;
  n += C.pr.campaigns.filter((c) => c.status === 'interview').length;
  n += (C.events?.list ?? []).filter((e) => e.leads && !e.leads.followed).length;
  n += Object.values(C.stores ?? {}).filter((s) => s.status === 'rejected' || s.status === 'built').length;
  return n;
}

export default {
  id: 'channels',
  title: 'Channels',
  icon: '🤝',
  group: 'Growth',
  badge: (state) => urgent(state) || null,
  render(root, ctx) {
    const s = ctx.state;
    ensureChannels(s);
    const tabs = tabsFor(s);
    const tabId = (ctx.params || 'overview').split(':')[0];
    const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
    mount(root, html`${css}
      <div class="app-head"><div><h1>Channels & partnerships</h1>
        <p>Every acquisition channel beyond ads and organic content, with realistic timelines: most take weeks to months before the first result and only a few will work for your business. You do the work — the outreach, listings, pitches and ad reads are judged by AI personas built from your ICP.</p></div></div>
      <nav class="tabs">${tabs.map((t) => html`<a href="#/channels/${t.id}" class="${t.id === tab.id ? 'active' : ''}">${t.label}</a>`)}</nav>
      ${tab.render(ctx)}`);
    tab.wire(root, ctx);
  },
  onDay(state) {
    channelsDay(state);
  },
};
