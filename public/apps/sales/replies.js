// Reply gating (statistics first, LLM persona second) and prospect personas (pure).
// The gate decides IF and HOW someone replies using research base rates; the LLM only writes the words.
import { clamp, hash, words } from '../../core/util.js';
import { SALES } from './params.js';
import { MARKET } from '../../core/params.js';
import { specificity } from './copy.js';
import { isRoleAddress } from './csv.js';
import { competitionFor, budgetFactor, isStrong } from './competition.js';

const u01 = (s) => (parseInt(hash(s), 36) % 100000) / 100000;
const pickBy = (seed, arr) => arr[Math.floor(u01(seed) * arr.length) % arr.length];

export const isSaasIcp = (state) => /\b(saas|software|developer|devtools?|startups?|engineering teams?|cto|product teams?|b2b tech)\b/i.test(`${state.company.icp} ${state.company.oneLiner}`);

// Personalization tier for one prospect & step: generic | basic | researched | warm.
export function tierFor({ contact, company, analysis, stepIndex = 0 }) {
  // Follow-ups inherit the first email's tier.
  if (stepIndex > 0 && contact.tier) return contact.tier;
  const usesP = analysis?.usesPersonalization;
  const spec = usesP ? specificity(contact.personalization, company) : 0;
  // 'warm' needs a real relationship (inbound, network, intro). A LinkedIn connection only adds its own lift.
  if (contact.warm && spec >= 0.3) return 'warm';
  if (spec >= 0.55) return 'researched';
  if (spec >= 0.3) return 'basic';
  return 'generic'; // merge fields alone ({{firstName}}, {{company}}) read as automation in 2026
}

export const copyMultiplier = (q) => clamp(0.3 + q, 0.3, 1.3);
export const fitMultiplier = (fit) => (fit == null ? 1 : clamp(0.4 + 1.2 * fit, 0.4, 1.6));

// Share of a full sequence's replies a given step yields.
export function stepWeight(i) {
  const w = SALES.stepWeights;
  return w[Math.min(i, w.length - 1)];
}

/** Probability this inboxed email gets a human reply. */
export function replyProbability({ tier, stepIndex = 0, quality = 0.6, fit = null, saas = false, contact = {}, aiSdr = false }) {
  let p = SALES.replyTier[tier] * stepWeight(stepIndex) * copyMultiplier(quality) * fitMultiplier(fit);
  if (saas) p *= SALES.saasBuyerPenalty;
  if (contact.linkedinConnected) p *= SALES.linkedinConnectedLift;
  if (isRoleAddress(contact.email ?? '')) p *= SALES.roleAddressPenalty.reply;
  if (aiSdr) p *= 0.8;
  return clamp(p, 0, 0.5);
}

export function positiveShare({ tier, quality = 0.6, fit = null }) {
  return clamp(SALES.positiveShare[tier] * (0.7 + 0.4 * quality) * (fit == null ? 1 : 0.8 + 0.4 * fit), 0.08, 0.55);
}

// Given a reply happened: which kind? r1, r2 uniform draws.
export function replyKind(pPositive, r1, r2) {
  if (r1 < pPositive) return r2 < SALES.positiveSplit.interested ? 'interested' : 'curious';
  const n = SALES.negativeSplit;
  return r2 < n.not_now ? 'not_now' : r2 < n.not_now + n.objection ? 'objection' : 'unsubscribe';
}
export const isPositive = (kind) => kind === 'interested' || kind === 'curious' || kind === 'inbound';

/**
 * Will the prospect agree to a meeting after the founder's latest reply?
 * kind: their disposition; asked: founder proposed a call; delayDays: founder's response time; quality: replyQuality().
 */
export function meetingProbability({ kind, asked, delayDays = 0, quality = 1, hasProduct = true, priorAsks = 0 }) {
  if (!asked) return 0;
  let p = SALES.meetingFromReply[kind] ?? 0.1;
  p *= delayDays <= 1 ? 1.1 : delayDays <= 3 ? 0.9 : 0.6;
  p *= 0.5 + 0.5 * quality;
  if (!hasProduct) p *= 0.75; // discovery calls still happen pre-product, a bit less often
  p *= Math.pow(SALES.repeatAsk.decay, Math.max(0, priorAsks)); // asking again after no answer halves the odds
  return clamp(p, 0, 0.9);
}

// ---- Personas ----

const TOOLS = {
  smb: ['spreadsheets and a shared Google Drive', 'a patchwork of Zapier automations', 'pen, paper and WhatsApp', 'an old desktop app they bought in 2017', 'a part-time VA doing it manually', 'a big all-in-one suite they barely use'],
  ent: ['an internal tool the data team built', 'Salesforce plus spreadsheets', 'a legacy vendor on a 3-year contract', 'a consulting firm', 'ServiceNow workflows', 'manual processes across three teams'],
};
const TIMELINES = ['this quarter', 'next quarter', 'sometime this year', 'no timeline: it is annoying but not urgent'];
const OBJECTIONS = ['we tried something like this and nobody used it', 'switching costs: migrating our data is a pain', 'budget is frozen until next quarter', 'my partner/boss decides on tools', 'how is this different from what we already pay for?', 'we are wary of AI tools touching customer data', 'we are too small for another subscription'];

export function authorityFor(title = '') {
  if (/\b(founder|owner|ceo|president|principal|managing (director|partner)|coo|cfo|cto)\b/i.test(title)) return 'economic buyer';
  if (/\b(vp|vice president|head|director|chief)\b/i.test(title)) return 'budget influencer / likely champion';
  if (/\b(manager|lead|ops|operations)\b/i.test(title)) return 'champion without budget';
  return 'end user with no buying authority';
}

/** Deterministic hidden persona facts for a contact (same every time). */
/** Employees from a size string ('11-50', '200+', 'solo', '45') or a model default [design]. */
export function employeesOf(company = {}, model = 'smb') {
  if (company.employees) return company.employees;
  const sz = String(company.size ?? '').toLowerCase();
  if (/solo|just me|1 person/.test(sz)) return 1;
  const nums = (sz.replace(/,/g, '').match(/\d+(\.\d+)?\s*k?/g) ?? []).map((x) => parseFloat(x) * (/k/.test(x) ? 1000 : 1));
  if (nums.length >= 2) return Math.max(1, Math.round(Math.sqrt(nums[0] * nums[1])));
  if (nums.length === 1) return Math.max(1, Math.round(nums[0] * (/\+/.test(sz) ? 1.5 : 1)));
  return model === 'ent' ? 500 : 8;
}
// Spend scales with company size, sublinearly [design]: 8 people ≈ 1×, 50 ≈ 2.5×, 500 ≈ 8×.
const sizeFactor = (emp) => clamp(Math.pow(emp / 8, 0.5), 0.35, 20);
const normal01 = (seed) => { const u = Math.max(1e-6, u01(seed + 'n1')), v = u01(seed + 'n2'); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

export function personaFor(state, contact, company = {}) {
  const seed = `${contact.email}|${company.domain ?? ''}`;
  const seg = state.company.model === 'ent' ? 'ent' : 'smb';
  const fit = company.research?.fit ?? 0.5;
  const hasPain = u01(seed + 'pain') < clamp(0.2 + 0.7 * fit, 0.1, 0.9);
  const pains = company.research?.pains?.length ? company.research.pains : [`the problem ${state.company.name} solves (${state.company.oneLiner || 'unclear'})`];
  // Willingness to pay is set by the BUYER: a reference price for this segment (MARKET.refPrice: SMB $79/mo,
  // enterprise $1,500/yr) × company size × pain × lognormal noise (σ 0.6). Independent of your list price.
  const refMonthly = seg === 'ent' ? MARKET.ent.refPrice / 12 : MARKET.smb.refPrice;
  const employees = employeesOf(company, seg);
  // Real competitive context (Market app): what they use today / have evaluated, deterministic per contact.
  const comp = competitionFor(state, { audience: 'prospect', seed: contact.id ?? company.id ?? seed });
  const uses = comp.uses;
  const strongIncumbent = isStrong(uses);
  const rival = comp.evaluated[0]?.name ?? comp.known.find((k) => k.relation === 'heard_of')?.competitor.name ?? null;
  const budgetMonthly = Math.max(5, Math.round(refMonthly * sizeFactor(employees) * (hasPain ? 1 : 0.3) * Math.exp(0.6 * normal01(seed + 'b')) * budgetFactor(comp)));
  // Budget is revealed as a stance; a range only after good discovery (see personaSystem / heuristicCallReply).
  const budgetStance = !hasPain ? 'no budget for this; it is not a priority' : uses && !uses.statusQuo ? `already paying for ${uses.name}; would move that budget only for a clear win` : budgetMonthly < refMonthly ? 'no budget line for this; would have to find it' : 'depends on the ROI; there is some discretionary budget';
  const budgetRange = [Math.max(5, Math.round(budgetMonthly * 0.6 / 10) * 10), Math.max(10, Math.round(budgetMonthly / 10) * 10)];
  const baseTimeline = hasPain ? pickBy(seed + 'tl', TIMELINES) : TIMELINES[3];
  return {
    name: contact.name || contact.firstName || 'the prospect',
    title: contact.title || 'unknown role',
    company: company.name || company.domain || 'their company',
    authority: authorityFor(contact.title),
    hasPain,
    pain: hasPain ? pickBy(seed + 'p', pains) : 'nothing pressing in this area; it works well enough',
    lastIncident: hasPain ? pickBy(seed + 'i', ['last month it cost them a full weekend to sort out', 'two weeks ago a customer complained about it', 'they hired a temp for it last quarter', 'it caused a mistake they had to refund', 'it is the reason their ops person works late on Fridays']) : 'none they can recall',
    currentTools: uses ? uses.name : pickBy(seed + 't', TOOLS[seg]),
    budgetMonthly, budgetStance, budgetRange, employees,
    // Status-quo users (spreadsheets…) switch easily but feel less urgency.
    timeline: uses?.statusQuo && baseTimeline === TIMELINES[0] ? TIMELINES[1] : baseTimeline,
    objection: uses && !uses.statusQuo ? (strongIncumbent ? `we already pay for ${uses.name} and moving everything off it is a big project` : `we already use ${uses.name}; why switch?`) : pickBy(seed + 'o', OBJECTIONS),
    incumbent: uses ? { name: uses.name, statusQuo: Boolean(uses.statusQuo), strong: strongIncumbent } : null,
    rival,
    competitorNames: comp.names,
    competitionBrief: comp.brief,
    decisionProcess: seg === 'ent' ? 'needs security review, a DPA and procurement; a VP signs' : /owner|founder|ceo/i.test(contact.title ?? '') ? 'decides alone, usually within a week' : 'the owner signs off on anything recurring',
  };
}

export function siteExcerpt(company, n = 2500) {
  const s = company?.site;
  if (!s) return company?.notes ? `Notes: ${company.notes}` : '(no website fetched)';
  return [s.title && `TITLE: ${s.title}`, s.description && `META: ${s.description}`, s.headings?.length && `HEADINGS: ${s.headings.slice(0, 12).join(' | ')}`, s.text?.slice(0, n)].filter(Boolean).join('\n');
}

// Deterministic fallback text for a cold reply of a given kind.
export function fallbackColdReply(kind, { persona, company, sender, seed = '' }) {
  const first = (persona.name || '').split(' ')[0] || '';
  const sig = first ? `\n\n${first}` : '';
  const v = (arr) => pickBy(seed + kind, arr);
  switch (kind) {
    case 'interested': return v([`Hi ${sender}, timing is decent: ${persona.pain}. What does it cost and how long does setup take?${sig}`, `This is actually relevant. We use ${persona.currentTools} today and it's clunky. Happy to hear more.${sig}`]);
    case 'curious': return persona.rival ? `How are you different from ${persona.rival}?${sig}` : v([`How is this different from ${persona.currentTools}?${sig}`, `Maybe. Who else like us uses it?${sig}`, `What exactly would we have to change on our side?${sig}`]);
    case 'objection': return persona.incumbent && !persona.incumbent.statusQuo ? `We already use ${persona.incumbent.name}. Not worth switching right now.${sig}` : v([`Not convinced, ${persona.objection}.${sig}`, `We're fine with ${persona.currentTools} for now.${sig}`]);
    case 'not_now': return v([`Not a priority right now. Maybe check back next quarter.${sig}`, `Busy season here. Ping me in a few months.${sig}`]);
    case 'unsubscribe': return v(['Please remove me from your list.', 'Not interested. Stop emailing me.', `Wrong person, and please take me off this list.`]);
    case 'ooo': return `I'm out of the office with limited access to email and will reply when I'm back. ${company?.name ? `For urgent matters contact the ${company.name} team.` : ''}`.trim();
    case 'hallucination': return v([`We don't use any of the tools you mentioned. Did a bot write this?`, `None of that is true about us. Please remove me.`]);
    default: return `Thanks.${sig}`;
  }
}

// Deterministic fallback for the prospect answering the founder in Mail.
export function fallbackThreadReply({ kind, persona, meeting, slotText, asked, founderText }) {
  const first = (persona.name || '').split(' ')[0];
  const sig = first ? `\n\n${first}` : '';
  if (kind === 'unsubscribe') return `I asked to be removed. Please stop.${sig}`;
  if (meeting) return `OK, let's do ${slotText}. 20 minutes max, and please keep it about our situation, not a slide deck.${sig}`;
  if (asked) {
    if (kind === 'not_now' || kind === 'objection') return `Not going to make time for this right now. ${persona.objection[0].toUpperCase() + persona.objection.slice(1)}.${sig}`;
    return `Can you just send a couple of lines on how it works and the price? I'll take a look when I get a minute.${sig}`;
  }
  const qs = /\?/.test(founderText);
  if (qs && persona.hasPain) return `Honestly, ${persona.pain}. We use ${persona.currentTools}. ${persona.lastIncident[0].toUpperCase() + persona.lastIncident.slice(1)}.${sig}`;
  if (qs) return `It's not a big problem for us. We use ${persona.currentTools} and it's fine.${sig}`;
  return words(founderText) > 120 ? `That's a lot of text. What's the one thing you want from me?${sig}` : `Noted.${sig}`;
}
