// Catalog for the Channels app: marketplace/app-store specifics, and deterministic per-company lists of
// podcasts, YouTube creators, conferences, co-marketing partners, agencies/resellers and press outlets.
// Store fees and review times: docs/research/channels-partnerships-pricing.md §1.3 (sources inline).
// Generated lists are fictional placeholders sized by [design] ranges; prices follow the cited CPM ranges.

import { CHANNELS } from '../../data/channels.js';
import { hash } from '../../core/util.js';

export const channelById = (id) => CHANNELS.find((c) => c.id === id);

// Seeded generator (independent from the game rng so lists are stable and don't consume game randomness).
export function seeded(key) {
  let seed = parseInt(hash(String(key)), 36) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickR = (r, a) => a[Math.floor(r() * a.length)];

// ---- Marketplaces & app stores ----
// review: [min, max] days in queue. reject: base rejection chance per submission [design].
// fee: revenue-share rule for revenue from customers acquired through the store (see model.revShareFee).
export const STORES = {
  shopify: {
    label: 'Shopify App Store', channel: 'shopify_app_store', models: ['smb'], registration: 19, review: [7, 30], reject: 0.3,
    fee: { pct: 0, thresholdUsd: 1_000_000, pctAfter: 0.15 }, feeText: '0% on first $1M lifetime, then 15% (+2.9% processing on Shopify Billing, not simulated separately)',
    notes: 'Official review 5–10 business days; ~30 days reported in 2026 forums. 4 in 5 apps have <10 reviews.', paidApp: true,
  },
  hubspot: {
    label: 'HubSpot App Marketplace', channel: 'hubspot_marketplace', models: ['smb', 'ent'], registration: 0, review: [10, 30], reject: 0.25,
    fee: { pct: 0 }, feeText: 'No listing fee observed (app bills its own customers)',
    notes: 'Certification needs 6+ months listed and 60 active installs (since 2024-05).', paidApp: true, certify: { installs: 60, days: 180 },
  },
  salesforce: {
    label: 'Salesforce AppExchange', channel: 'salesforce_appexchange', models: ['ent', 'smb'], registration: 0, review: [45, 120], reject: 0.45, reviewFee: 999,
    fee: { pct: 0.15 }, feeText: 'Security review ~$999 per attempt (older official doc); revenue share historically 15–25% (we use 15%)',
    notes: 'Security review often takes multiple rounds; leads need an enterprise sales motion.', paidApp: true, leads: true,
  },
  atlassian: {
    label: 'Atlassian Marketplace (Forge)', channel: 'atlassian_marketplace', models: ['smb', 'ent'], registration: 0, review: [7, 21], reject: 0.2,
    fee: { pct: 0, thresholdUsd: 1_000_000, pctAfter: 0.17 }, feeText: 'Forge: 0% on first $1M lifetime (Runs-on-Atlassian), then 17% from 2026-10 (Connect apps 25%)',
    notes: 'Atlassian bills customers; 30-day free trial is the marketplace standard.', paidApp: true,
  },
  slack: {
    label: 'Slack Marketplace', channel: 'slack_gws_ms_marketplaces', models: ['smb', 'ent', 'b2c'], registration: 0, review: [7, 28], reject: 0.25,
    fee: { pct: 0 }, feeText: 'No fee found', notes: 'Low directory browse traffic; the listing is mostly a trust signal.', paidApp: false,
  },
  google_workspace: {
    label: 'Google Workspace Marketplace', channel: 'slack_gws_ms_marketplaces', models: ['smb', 'ent', 'b2c'], registration: 0, review: [3, 14], reject: 0.2, sensitiveExtra: [30, 120],
    fee: { pct: 0 }, feeText: 'No listing fee', notes: 'Review takes several days; sensitive Gmail/Drive scopes need extra verification (can take months).', paidApp: false,
  },
  microsoft: {
    label: 'Microsoft Marketplace (AppSource)', channel: 'slack_gws_ms_marketplaces', models: ['ent', 'smb'], registration: 0, review: [14, 45], reject: 0.3,
    fee: { pct: 0.03 }, feeText: '3% store fee on transactable offers; free to publish', notes: 'Enterprise buyers can burn committed Azure spend.', paidApp: true, leads: true,
  },
  zapier: {
    label: 'Zapier integration directory', channel: 'zapier_integration', models: ['smb', 'b2c', 'ent'], registration: 0, review: [7, 21], reject: 0.15,
    fee: { pct: 0 }, feeText: 'Free; partner tiers by active users (Silver 50 / Gold 350 / Platinum 3,000) unlock directory leads',
    notes: 'Integration is a checkbox until you have users; templates matter.', paidApp: false, tiers: [50, 350, 3000],
  },
  chrome: {
    label: 'Chrome Web Store extension', channel: 'chrome_web_store', models: ['b2c', 'smb'], registration: 5, review: [2, 21], reject: 0.2,
    fee: { pct: 0 }, feeText: 'One-time registration (historically $5); no revenue share — payments off-store',
    notes: 'Since 2026-08 new publishers get 2 publication slots by default; broad permissions slow review.', paidApp: false,
  },
  chatgpt: {
    label: 'ChatGPT apps directory', channel: 'ai_assistant_apps', models: ['b2c', 'smb', 'ent'], registration: 0, review: [14, 45], reject: 0.35,
    fee: { pct: 0 }, feeText: 'No fee; no in-chat digital goods/subscription sales at launch — monetize via account linking',
    notes: 'Submissions opened 2025-12-17. No public install or conversion data exists: very high variance.', paidApp: false,
  },
  claude: {
    label: 'Claude Connectors Directory (remote MCP)', channel: 'ai_assistant_apps', models: ['b2c', 'smb', 'ent'], registration: 0, review: [14, 60], reject: 0.4,
    fee: { pct: 0 }, feeText: 'No fee; reviewed by Anthropic for security/reliability, inclusion not guaranteed',
    notes: 'Remote MCP server with OAuth; local servers via MCPB/Desktop Extensions or plugins instead.', paidApp: false,
  },
};
export const storeChannel = (storeId) => channelById(STORES[storeId]?.channel);

// ---- Generated lists (stable per company) ----

const PODCAST_NAMES = {
  b2c: ['Life Hacked', 'The Money Minute', 'Better Habits', 'Tech for Humans', 'The Side Hustle Show'],
  smb: ['Small Business Bootcamp', 'The Agency Hour', 'Ops Unfiltered', 'Bootstrapped Weekly', 'The Ecom Playbook'],
  ent: ['RevOps Radio', 'The CIO Agenda', 'Finance Leaders Pod', 'Security Hot Takes', 'Scaling Ops'],
};
const YT_NAMES = {
  b2c: ['Ali Explains Apps', 'MinimalTech', 'The Study Corner', 'Gadget Dad', 'Kai Reviews'],
  smb: ['Indie Ops TV', 'Shopify Simplified', 'Freelance Friday', 'No-Code Nate', 'The SaaS Shelf'],
  ent: ['Cloud Architect Diaries', 'Data Team Daily', 'IT Admin Life', 'RevOps Rachel', 'Enterprise AI Weekly'],
};

export function podcasts(state) {
  const r = seeded(`${state.company.name}|pods`);
  const cpmLo = state.company.model === 'b2c' ? 18 : 25, cpmHi = state.company.model === 'ent' ? 60 : 40; // Libsyn/Acast; niche B2B higher
  return PODCAST_NAMES[state.company.model].map((name, i) => ({ id: `pod_${i}`, kind: 'podcast', name, audience: Math.round((1500 + Math.pow(r(), 2) * 45000) / 100) * 100, cpm: Math.round(cpmLo + r() * (cpmHi - cpmLo)), fit: +(0.3 + r() * 0.7).toFixed(2) }));
}
export function creators(state) {
  const r = seeded(`${state.company.name}|yt`);
  return YT_NAMES[state.company.model].map((name, i) => {
    const subs = Math.round((5000 + Math.pow(r(), 2) * 250000) / 1000) * 1000;
    return { id: `yt_${i}`, kind: 'youtube', name, subs, audience: Math.round(subs * (0.05 + r() * 0.2)), cpm: Math.round(30 + r() * 40), fit: +(0.3 + r() * 0.7).toFixed(2) };
  });
}

const CONF = {
  b2c: [['App Promotion Summit', 3000], ['Creator Economy Expo', 6000], ['Local Tech Meetup', 120]],
  smb: [['SaaStr Annual', 10000], ['Shopify Partner Meetup', 400], ['Small Business Expo', 5000], ['MicroConf', 400], ['Local SaaS Meetup', 80]],
  ent: [['Dreamforce', 40000], ['Gartner Symposium', 8000], ['SaaStr Annual', 10000], ['RevOps Summit', 1500], ['Regional CIO Forum', 300]],
};
export function conferences(state) {
  const r = seeded(`${state.company.name}|conf`);
  return CONF[state.company.model].map(([name, attendees], i) => {
    const size = attendees >= 5000 ? 'large' : attendees >= 800 ? 'medium' : 'small';
    const boothSpace = size === 'large' ? 15000 : size === 'medium' ? 10000 : 1500; // 10x10 space $10k–$15k; meetups cheap
    const allIn = Math.round((boothSpace * (1.6 + r() * 1.6)) / 500) * 500; // all-in $15k–$50k incl. travel, booth, swag
    return {
      id: `conf_${i}`, name, attendees, size, icpDensity: +(0.2 + r() * 0.7).toFixed(2), boothAllIn: size === 'small' ? Math.round(boothSpace * 1.5) : allIn,
      ticket: size === 'small' ? 0 : Math.round((600 + r() * 1800) / 50) * 50, travel: size === 'small' ? 0 : Math.round((700 + r() * 1800) / 50) * 50,
      monthOffset: 2 + Math.floor(r() * 7), cfpLeadDays: size === 'small' ? 30 : 90 + Math.floor(r() * 150),
    };
  });
}

const PARTNER_CATS = {
  b2c: ['habit tracker app', 'budgeting app', 'note-taking app', 'fitness creator brand', 'study app'],
  smb: ['invoicing tool', 'scheduling tool', 'email marketing tool', 'Shopify app', 'bookkeeping tool', 'website builder'],
  ent: ['data warehouse vendor', 'identity provider', 'CRM add-on', 'BI tool', 'security vendor'],
};
const CO_A = ['Bright', 'North', 'Clear', 'Quick', 'Stack', 'Pilot', 'Nimbus', 'Harbor', 'Loop', 'Mint', 'Cobalt', 'Juniper'];
const CO_B = ['ly', 'base', 'flow', 'desk', 'hq', 'works', 'labs', 'kit', 'stack', 'ware'];
export function coPartners(state) {
  const r = seeded(`${state.company.name}|copartners`);
  return PARTNER_CATS[state.company.model].map((cat, i) => {
    const audience = Math.round(Math.pow(10, 2.7 + r() * 2.6) / 100) * 100; // 500 → ~200k
    return { id: `cp_${i}`, name: `${pickR(r, CO_A)}${pickR(r, CO_B)}`, category: cat, audience, overlap: +(0.1 + r() * 0.6).toFixed(2), contact: pickR(r, ['Head of Partnerships', 'Marketing lead', 'Co-founder', 'Content lead']) };
  });
}

const AGENCY_KINDS = {
  b2c: [['agency', 'App marketing agency'], ['agency', 'Creator management agency']],
  smb: [['agency', 'Shopify Plus agency'], ['agency', 'HubSpot solutions partner'], ['agency', 'Bookkeeping firm'], ['reseller', 'Regional IT reseller / MSP'], ['agency', 'Webflow agency'], ['reseller', 'Vertical software VAR']],
  ent: [['reseller', 'Value-added reseller (VAR)'], ['reseller', 'Managed service provider (MSP)'], ['agency', 'Salesforce consulting partner'], ['agency', 'Big-4 style consultancy practice'], ['reseller', 'Cloud marketplace reseller']],
};
export function partnerProspects(state) {
  const r = seeded(`${state.company.name}|agencies`);
  const out = [];
  for (let i = 0; i < 10; i++) {
    const [kind, type] = pickR(r, AGENCY_KINDS[state.company.model]);
    out.push({ id: `ap_${i}`, kind, type, name: `${pickR(r, CO_A)} ${pickR(r, ['Partners', 'Digital', 'Group', 'Solutions', 'Consulting', 'Systems'])}`, clients: 5 + Math.floor(r() * (kind === 'reseller' ? 300 : 60)), fit: +(0.2 + r() * 0.8).toFixed(2) });
  }
  return out;
}

export const OUTLETS = {
  tier1: { label: 'Tier-1 tech/business press (TechCrunch, The Verge, Business Insider…)', beat: 'startups and tech' },
  trade: { label: 'Trade / niche outlets and newsletters for your industry', beat: 'your industry' },
};

// Directories (2026): AI tool directories, SaaS lists, alternatives sites [design] costs/volumes.
export const DIRECTORIES = [
  { id: 'dir_ai', label: 'AI tool directories (Futurepedia-style, There\'s An AI For That…)', cost: 0, paidCost: 300, monthly: [2, 25], b2c: 1, smb: 1, ent: 0.3 },
  { id: 'dir_saas', label: 'SaaS directories (SaaSHub, AlternativeTo, Capterra free listing…)', cost: 0, paidCost: 0, monthly: [1, 15], b2c: 0.5, smb: 1, ent: 0.6 },
  { id: 'dir_launch', label: 'Startup launch lists (BetaList, Uneed, Fazier…)', cost: 0, paidCost: 129, monthly: [1, 10], b2c: 1, smb: 0.8, ent: 0.2 },
  { id: 'dir_niche', label: 'Niche industry directories / association member lists', cost: 0, paidCost: 250, monthly: [1, 12], b2c: 0.3, smb: 1, ent: 1 },
];
