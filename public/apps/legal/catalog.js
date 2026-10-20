// Legal app parameters. Sources: docs/research/hr-legal-product.md §2 and finance-and-payments.md §4
// (checked 2026). [S] secondary, [P] primary, [A] game-design assumption — the UI labels [A] values.
// General information, not legal advice.

import { COMPANY } from '../../core/params.js';

// Formation services, Q4 2026 (docs/research/tools/2026q4/back-office-finance.md §1, "BOF"). Paradigms: Atlas = one-shot
// fundraising-ready Delaware C-corp inside the Stripe ecosystem; Clerky = law-firm-grade documents, bring your own bank;
// doola / Firstbase = formation plus a recurring compliance subscription for non-US founders (address + agent bundled).
export const PROVIDERS = {
  atlas: {
    label: 'Stripe Atlas', entity: 'ccorp', jurisdiction: 'DE', fee: COMPANY.incorporation.atlas, agentAnnual: 100, agentFirstYearFree: true,
    hours: 1.5, days: 2, einByService: true, files83b: true,
    includes: '$500 one-time incl. Delaware fees and registered agent year 1 ($100/yr after), next-day filing (~2 business days), EIN, founder stock + 83(b) filing, IP assignment, templates, $2,500 Stripe credits [vendor]. Not a law firm; check the authorized shares (franchise tax).',
  },
  clerky: {
    label: 'Clerky (pay-per-use)', entity: 'ccorp', jurisdiction: 'DE', fee: COMPANY.incorporation.clerky, agentAnnual: 125, agentFirstYearFree: false,
    hours: 3, days: 5, einByService: false, files83b: true,
    includes: 'Lawyer-built, VC-preferred document set: Delaware formation, founder stock + vesting, IP assignment, board consents, 83(b) prep, CIIAA. ~$427 one-time; packages quoted $799-819 [third-party, conflicting]. Registered agent and bank are separate.',
  },
  firstbase: {
    label: 'Firstbase', entity: 'ccorp', jurisdiction: 'DE', fee: 399, agentAnnual: 299, agentFirstYearFree: false, nonUsFit: true,
    hours: 2.5, days: 5, einByService: true, files83b: false,
    includes: 'Start $399 one-time; "Agent Autopilot" registered agent $299/yr per state; Mailroom Premium $350/yr extra [third-party, Aug 2026]. EIN for non-US founders. Founder docs and 83(b) are on you. Ownership status uncertain (an unverified acquisition record, Dec 2025).',
  },
  doola: {
    label: 'doola (Delaware LLC)', entity: 'llc', jurisdiction: 'DE', fee: 297, stateFee: 110, agentAnnual: 297, agentFirstYearFree: false, nonUsFit: true, mailroom: 'bundled',
    hours: 2, days: 7, einByService: true, files83b: false,
    includes: 'Starter $297/yr: formation, EIN without an SSN, operating agreement, registered agent and a virtual US address; Delaware filing fee ($110) extra. Tax & Compliance $1,999/yr, Business-in-a-Box $2,999/yr [vendor]. Built for non-US and LLC-first founders.',
  },
  diy_llc: {
    label: 'DIY home-state LLC', entity: 'llc', jurisdiction: 'home', fee: 150, agentAnnual: 0, agentFirstYearFree: false,
    hours: 4, days: 10, einByService: false, files83b: false,
    includes: 'State filing fee (~$50–500 depending on state, game value $150). You are your own registered agent (home address becomes public) and write your own operating agreement.',
  },
};

// Where the founder actually operates → foreign qualification + annual state fees (approximate; verify with the state).
export const OPERATING_STATES = {
  DE: { label: 'Delaware (or nowhere else)', qualify: 0, annual: 0 },
  CA: { label: 'California', qualify: 100, annual: 800, due: '04-15', name: 'California $800 minimum franchise tax' },
  NY: { label: 'New York', qualify: 225, annual: 9, due: '06-30', name: 'New York biennial statement (approx.)' },
  TX: { label: 'Texas', qualify: 750, annual: 0, due: '05-15', name: 'Texas franchise "no tax due" report + PIR' },
  FL: { label: 'Florida', qualify: 70, annual: 150, due: '05-01', name: 'Florida annual report' },
  WA: { label: 'Washington', qualify: 180, annual: 70, due: '06-30', name: 'Washington annual report (approx.)' },
  other: { label: 'Another US state', qualify: 150, annual: 100, due: '04-15', name: 'State annual report [A]' },
  nonus: { label: 'Outside the US (non-US founder)', qualify: 0, annual: 0 },
};

export const CONVERSION = { fee: 3500, hours: 6, days: 30 }; // LLC → DE C-corp legal fees [A]

// Delaware (finance research §4.2, hr-legal §2.1).
export const DELAWARE = {
  annualReportFee: COMPANY.delawareAnnualReportFee, // $50
  apvcPerMillion: 400, apvcMin: 400, maxTax: 200000,
  latePenalty: 200, lateInterestMonthly: 0.015,
  llcTax: 400, // tax year 2026 (HB 400)
};
// Amending an Authorized Shares filing to the APVC method: founder time and how long the refund takes [design].
export const DELAWARE_AMEND = { hours: 1.5, refundDays: 60 };

// 10M issued to founders matches the cap table's FOUNDER_SHARES; 12M authorized leaves room for a pool (review F16).
export const FOUNDER_STOCK = { authorized: 12_000_000, issued: 10_000_000, par: 0.00001, vestYears: 4, cliffDays: 365 };
export const DEADLINE_83B_DAYS = 30;

export const POLICIES = {
  generator: { label: 'Generator (Termly-style): ToS, privacy, cookie banner', monthly: 15, hours: 1.5, quality: 'ok' }, // $10–20/site/mo [S]
  lawyer: { label: 'Lawyer-drafted terms + privacy review', once: 3000, hours: 3, quality: 'strong' }, // $1.5k–5k [A]
  template: { label: 'Copy a free template yourself', once: 0, hours: 3, quality: 'weak' },
};

export const DPA = {
  template: { label: 'Template DPA (Common Paper / generator) + subprocessor list', once: 0, hours: 1.5 },
  lawyer: { label: 'Law-firm DPA + security exhibit', once: 1500, hours: 1 }, // $0–2k [A]
};

export const GDPR_ITEMS = {
  lawfulBasis: { label: 'Lawful basis for each processing purpose', hours: 1 },
  ropa: { label: 'Records of processing (RoPA)', hours: 1 },
  subprocessors: { label: 'Public subprocessor list (incl. your LLM provider)', hours: 0.5 },
  dsr: { label: 'Data-subject request process (answer within 1 month)', hours: 0.5 },
  breach: { label: 'Breach response plan (notify authority within 72h)', hours: 1 },
  transfers: { label: 'International transfers: SCCs / EU-US Data Privacy Framework', hours: 0.5 },
};

export const AI_ACT_ITEMS = {
  disclosure: { label: 'Art. 50: tell users they are interacting with AI', hours: 1, from: '2026-08-02' },
  marking: { label: 'Art. 50(2): machine-readable marking of AI-generated content', hours: 2, from: '2026-12-02', note: 'grace date for systems already on the market; sources differ (some say 2027-12-02)' },
  literacy: { label: 'Art. 4: AI literacy measures for your team', hours: 1, from: '2025-02-02' },
  llmTerms: { label: 'LLM terms: no training on customer data, model provider as subprocessor, retention', hours: 1, from: null },
  highRisk: { label: 'Annex III high-risk review (hiring, credit, education…): risk mgmt, logging, human oversight', hours: 6, once: 0, from: '2027-12-02' },
};
export const AI_ACT_DATES = [
  ['2025-02-02', 'Prohibited practices (Art. 5) and AI literacy (Art. 4) apply'],
  ['2025-08-02', 'General-purpose AI model obligations (mainly model providers)'],
  ['2026-08-02', 'Art. 50 transparency: disclose AI interactions, mark synthetic content'],
  ['2026-12-02', 'New Art. 5 prohibitions (non-consensual intimate imagery, CSAM generation); Art. 50(2) marking grace ends (sources differ)'],
  ['2027-12-02', 'Annex III high-risk obligations (moved from 2026-08-02 by the AI Omnibus)'],
  ['2028-08-02', 'Annex I high-risk (AI in regulated products)'],
];

// SOC 2 (research §2.5).
export const SOC2 = {
  platform: 10000, // Vanta/Drata/Secureframe entry ~$7.5k–10k/yr in 2026 [S]
  type1Audit: 10000, // $5k–15k [S]
  type2Audit: 20000, // $12k–40k [S]
  pentest: 10000, // $8k–30k [S]
  type1Days: 120, // 3–6 months [S]
  readinessDays: 60, // before a Type II window when starting from scratch [A]
  fieldworkReportDays: 56, // 2–5 weeks fieldwork + 2–6 weeks report [S]
  // Internal effort: research puts internal time at $25k–90k (~250–900h across a team). Solo-founder game values:
  // 8h/week during Type I prep, 6h/week through a Type II window, plus a one-off 20h policy & evidence sprint (review F14).
  weeklyHours: { type1: 8, type2: 6 },
  sprintHours: 20, sprintPerWeek: 10,
  kickoffHours: 3,
};

// USPTO (research §2.6), fees from 2025-01-18.
export const TRADEMARK = {
  perClass: 350, freeformSurcharge: 200, insufficientSurcharge: 100, extraCharsSurcharge: 200,
  attorney: 1000, // $500–2k [A]
  examDays: 210, // first examination ~7 months [A]
  officeActionChance: 0.4, // [A]
  responseDays: 90, extensionFee: 125, // 3-month response period + 3-month extension (approx.)
  publicationDays: 30, registrationDays: 120, // [A] → ~12+ months total
  classes: { '009': 'Class 009 — downloadable software', '042': 'Class 042 — SaaS / non-downloadable software', '035': 'Class 035 — business services' },
};

export const CONTRACTS = {
  template: { label: 'Standard templates (Common Paper / Bonterms): MSA + Order Form', once: 0, hours: 2 },
  lawyer: { label: 'Lawyer-drafted MSA + Order Form', once: 2500, hours: 2 }, // [A]
  esign: { label: 'E-signature (Dropbox Sign / DocuSign-style)', monthly: 20, hours: 0.5 }, // [A]
};

// Who reviews customer paper (BOF §6). Crosby is a law firm (barred attorneys review every document), not CLM software:
// contracts go in over Slack and come back as a human-reviewed redline in about an hour (median ~58 min [vendor]).
// Per-document prices are not published: the game's are [design]. A traditional firm bills hours and takes days.
export const CONTRACT_COUNSEL = {
  diy: { label: 'You (templates + AI drafting)', perDoc: 0, founderHours: 0, paradigm: 'You pick each position and write the cover note yourself (Legal → Contracts).' },
  crosby: { label: 'Crosby (AI-native law firm)', perDoc: 750, founderHours: 0.25, setupHours: 0.5, turnaround: { median: 0.05, p90: 0.3, unit: 'day', src: '[vendor] median ~58 min turnaround' }, paradigm: 'Paste the contract in Slack, pick a risk tolerance; AI drafts and a barred attorney reviews every redline, back in about an hour at a fixed per-document price.' },
  lawyer: { label: 'Traditional startup law firm (hourly)', perDoc: 1800, founderHours: 0.75, setupHours: 1, turnaround: { median: 4, p90: 9, unit: 'bday', src: '[design] 3-4 attorney hours at $450-600/h, queued behind other clients' }, paradigm: 'Email the redline, a partner or associate marks it up in a few business days, billed by the hour.' },
};
// Contract tools (BOF §6). PandaDoc: proposals, quotes and e-sign (~$19/seat/mo [third-party]); its AI suggests clauses,
// it is not legal review. Juro and Ironclad are in-house CLM: you or counsel still negotiate; shelfware for small teams.
export const CLM = {
  none: { label: 'No contract tool', monthly: 0, annual: 0, setupHours: 0 },
  pandadoc: { label: 'PandaDoc (proposals + e-sign)', monthly: 19, annual: 0, setupHours: 1, esign: true, src: '~$19/seat/mo [third-party]' },
  juro: { label: 'Juro (browser-native CLM)', monthly: 0, annual: 15000, setupHours: 6, esign: true, clm: true, src: 'quote-based, $15K-75K/yr est. [third-party]' },
  ironclad: { label: 'Ironclad (enterprise CLM)', monthly: 0, annual: 30000, setupHours: 20, esign: true, clm: true, outdated: true, src: 'quote-based, $30K-250K+/yr (Vendr est.) [third-party]' },
};
export const CLM_MIN_CONTRACTS = 100; // contracts a year below which CLM software is shelfware [design]

export const ONE_099 = { threshold: 2000, perForm: 4, hoursPerForm: 0.25, late: [[30, 60], [182, 130], [Infinity, 340]] }; // OBBBA $2,000 for 2026 payments; penalties approx. IRS tiers

export const LEGAL_BENCHMARKS = { seedYearOne: [5000, 20000], indieLlc: [500, 3000] }; // [S] / [A]

// Priced seed legal (review F20): clean company ~$10–15k company counsel; clean-up adds ~$8k when diligence
// finds issues; investor counsel is typically capped (~$15k) and paid by the company. Unmodified YC SAFE: $0 DIY.
export const SEED_LEGAL = { companyCounsel: 12000, cleanupIfIssues: 8000, investorCounselCap: 15000, safeDiy: 0, safeViaClerky: [150, 500] };
