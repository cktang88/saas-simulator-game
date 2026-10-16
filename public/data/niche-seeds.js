// Seeds for the fractal niche engine (core/niche.js): geography, size bands and generic dossier ingredients used by the
// OFFLINE dossier generator. Everything here is a [design] estimate unless noted; the numbers only make an offline
// niche feel plausible and are never shown as real statistics. Real figures come from the web-grounded research job.

// US states with population in millions (rounded, Census 2020/2024 order of magnitude). Used as share weights for a geography split.
export const US_STATES = [
  ['alabama', 5.1], ['alaska', 0.73], ['arizona', 7.4], ['arkansas', 3.1], ['california', 39.0], ['colorado', 5.9], ['connecticut', 3.6], ['delaware', 1.0],
  ['florida', 22.6], ['georgia', 11.0], ['hawaii', 1.4], ['idaho', 2.0], ['illinois', 12.5], ['indiana', 6.8], ['iowa', 3.2], ['kansas', 2.9],
  ['kentucky', 4.5], ['louisiana', 4.6], ['maine', 1.4], ['maryland', 6.2], ['massachusetts', 7.0], ['michigan', 10.0], ['minnesota', 5.7], ['mississippi', 2.9],
  ['missouri', 6.2], ['montana', 1.1], ['nebraska', 2.0], ['nevada', 3.2], ['new hampshire', 1.4], ['new jersey', 9.3], ['new mexico', 2.1], ['new york', 19.6],
  ['north carolina', 10.8], ['north dakota', 0.78], ['ohio', 11.8], ['oklahoma', 4.0], ['oregon', 4.2], ['pennsylvania', 13.0], ['rhode island', 1.1], ['south carolina', 5.4],
  ['south dakota', 0.92], ['tennessee', 7.1], ['texas', 30.5], ['utah', 3.4], ['vermont', 0.65], ['virginia', 8.7], ['washington', 7.8], ['west virginia', 1.8],
  ['wisconsin', 5.9], ['wyoming', 0.58],
];

// Other places a player might name (resolved to a hashed slot of a generic region split).
export const OTHER_PLACES = ['uk', 'united kingdom', 'england', 'canada', 'australia', 'germany', 'france', 'ireland', 'netherlands', 'spain', 'italy', 'india', 'mexico', 'brazil', 'singapore', 'new zealand', 'midwest', 'northeast', 'southeast', 'southwest', 'west coast', 'east coast', 'pacific northwest', 'new england', 'rural', 'urban', 'suburban', 'europe', 'emea', 'apac', 'latam'];

// Size bands inside a niche: share of the niche, relative willingness to pay [design], employee range.
export const SIZE_BANDS = [
  { id: 'micro', label: 'micro (1-10 people)', share: 0.55, wtp: 0.7, employees: [1, 10] },
  { id: 'small', label: 'small (11-50 people)', share: 0.28, wtp: 1.0, employees: [11, 50] },
  { id: 'mid', label: 'mid-size (51-250 people)', share: 0.12, wtp: 1.5, employees: [51, 250] },
  { id: 'large', label: 'large (250+ people)', share: 0.05, wtp: 2.3, employees: [251, 2500] },
];

// Annual revenue per employee by segment group, US dollars [design].
export const REVENUE_PER_EMPLOYEE = { owner_smb: 90000, professional: 210000, company: 240000, regulated: 330000, health: 190000, public: 160000, education: 130000, nonprofit: 110000, b2c: 0 };

// How many such organisations exist in the US, order of magnitude by segment group [design].
export const NATIONAL_COUNT = { owner_smb: [60000, 400000], professional: [20000, 120000], company: [15000, 90000], regulated: [3000, 20000], health: [30000, 200000], public: [5000, 60000], education: [4000, 40000], nonprofit: [20000, 150000], b2c: [0, 0] };

// Tools commonly used by a segment (real vendor names are fine). Mirrors the tech hints in sales/prospector.js.
export const TOOLS_BY_SEGMENT = {
  ecommerce: [['Shopify', 'storefront'], ['Stripe', 'payments'], ['Klaviyo', 'email marketing']],
  retail_shops: [['Square', 'point of sale'], ['Shopify', 'storefront'], ['QuickBooks', 'accounting']],
  restaurants: [['Toast', 'point of sale'], ['Square', 'point of sale'], ['OpenTable', 'reservations']],
  salons_fitness: [['Square', 'point of sale'], ['Mindbody', 'booking'], ['Stripe', 'payments']],
  trades: [['ServiceTitan', 'field service'], ['Jobber', 'field service'], ['QuickBooks', 'accounting']],
  health_practices: [['Dentrix', 'practice management'], ['Open Dental', 'practice management'], ['QuickBooks', 'accounting']],
  hospitals: [['Epic', 'electronic health record'], ['Microsoft 365', 'office suite']],
  law_firms: [['Clio', 'practice management'], ['Microsoft 365', 'office suite'], ['DocuSign', 'e-signature']],
  accounting_firms: [['QuickBooks', 'accounting'], ['Xero', 'accounting'], ['Microsoft 365', 'office suite']],
  agencies: [['HubSpot', 'CRM'], ['Slack', 'chat'], ['Notion', 'docs']],
  startup_smb: [['Stripe', 'payments'], ['HubSpot', 'CRM'], ['Slack', 'chat']],
  mid_market: [['Salesforce', 'CRM'], ['Microsoft 365', 'office suite'], ['Okta', 'identity']],
  enterprise: [['Salesforce', 'CRM'], ['Okta', 'identity']],
  banks: [['Microsoft 365', 'office suite'], ['Okta', 'identity']],
};
export const TOOLS_BY_GROUP = {
  owner_smb: [['QuickBooks', 'accounting'], ['Square', 'payments'], ['Google Workspace', 'office suite']],
  professional: [['Microsoft 365', 'office suite'], ['QuickBooks', 'accounting'], ['DocuSign', 'e-signature']],
  company: [['Google Workspace', 'office suite'], ['Slack', 'chat'], ['HubSpot', 'CRM']],
  regulated: [['Microsoft 365', 'office suite'], ['Okta', 'identity']],
  health: [['Microsoft 365', 'office suite'], ['QuickBooks', 'accounting']],
  public: [['Microsoft 365', 'office suite']],
  education: [['Google Workspace', 'office suite'], ['Zoom', 'video calls']],
  nonprofit: [['QuickBooks', 'accounting'], ['Mailchimp', 'email marketing'], ['Google Workspace', 'office suite']],
};

// Vocabulary people in the niche use, by group (jargon the player should pick up in interviews) [design].
export const VOCAB_BY_GROUP = {
  owner_smb: ['cash flow', 'slow season', 'walk-ins', 'regulars', 'margins', 'the books', 'comps', 'my guy at the bank'],
  professional: ['billable hours', 'realization', 'engagement letter', 'WIP', 'matter', 'retainer', 'utilization'],
  company: ['pipeline', 'ARR', 'runway', 'headcount plan', 'OKRs', 'tech stack', 'ramp'],
  regulated: ['audit trail', 'examiner', 'vendor risk review', 'policy exception', 'controls', 'SOC report'],
  health: ['chair time', 'no-show rate', 'production', 'collections', 'recall', 'payer mix', 'prior auth'],
  public: ['RFP', 'cooperative contract', 'fiscal year', 'board packet', 'sole source', 'appropriation'],
  education: ['FERPA', 'enrollment', 'adoption cycle', 'student data agreement', 'PD day'],
  nonprofit: ['restricted funds', 'grant cycle', 'donor retention', 'board giving', 'program costs'],
};

// Service providers that sell to a niche: typical pricing [design], scaled by segment group.
export const AGENCY_KINDS = [
  { kind: 'marketing', label: 'marketing agency', priceUsd: [1800, 6500], unit: 'per month retainer', pricing: 'Monthly retainer plus ad spend; 3-6 month minimum is common.' },
  { kind: 'recruiting', label: 'recruiting agency', priceUsd: [8000, 28000], unit: 'per hire (15-25% of first-year pay)', pricing: 'Contingency fee on first-year salary, paid only when a hire starts.' },
  { kind: 'dev', label: 'software dev shop', priceUsd: [90, 180], unit: 'per hour', pricing: 'Hourly or fixed-scope projects; a small integration usually lands in the low five figures.' },
  { kind: 'pr', label: 'PR firm', priceUsd: [3000, 9000], unit: 'per month retainer', pricing: 'Monthly retainer for trade-press outreach; results are slow and uneven.' },
  { kind: 'consulting', label: 'industry consultant', priceUsd: [150, 320], unit: 'per hour', pricing: 'Hourly or day rate; specialists who know the niche charge the top of the range.' },
];

export const GROUP_AGENCY_MULT = { owner_smb: 0.6, professional: 1.0, company: 1.2, regulated: 1.4, health: 0.9, public: 0.8, education: 0.8, nonprofit: 0.6 };

// Pain trigger templates, filled with the niche label [design].
export const TRIGGER_TEMPLATES = [
  'A key employee quits and nobody else knows how {job} is done.',
  'An audit, inspection or customer complaint exposes how {job} is really handled.',
  'Growth makes {job} break: the spreadsheet or the one person who handles it stops scaling.',
  'A competitor or peer switches tools and starts talking about it at the next association event.',
  'A bad month of cash flow forces the owner to look at what {job} actually costs.',
];

export const INCIDENT_TEMPLATES = [
  'A week of busy season, and {job} slipped; a customer noticed before anyone on the team did.',
  'The person who normally handled {job} was out sick and the backup made a costly mistake.',
  'Month-end arrived and the numbers for {job} did not reconcile; it took a weekend to fix by hand.',
  'A client asked for proof on {job} and the team spent two days digging through email and paper.',
];
