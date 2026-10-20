// Reply gating (statistics first, LLM persona second) and prospect personas (pure).
// The gate decides IF and HOW someone replies using research base rates; the LLM only writes the words.
import { clamp, hash, words } from '../../core/util.js';
import { SALES } from './params.js';
import { MARKET } from '../../core/params.js';
import { customerMarketCfg, customerTypeOf } from '../../core/customer-type.js';
import { specificity } from './copy.js';
import { isRoleAddress } from './csv.js';
import { competitionFor, budgetFactor, isStrong } from './competition.js';
import { personForContact, hasTruth, authorityOfPerson } from './truth-persona.js';
import { offlineAnswer } from '../../data/persona-prompts.js';

const u01 = (s) => (parseInt(hash(s), 36) % 100000) / 100000;
const pickBy = (seed, arr) => arr[Math.floor(u01(seed) * arr.length) % arr.length];

// The BUYER is software-minded: judged on the ICP only. Our own one-liner ("scheduling software for dentists") says nothing about who reads the email.
export const isSaasIcp = (state) => /\b(saas|software|developer|devtools?|startups?|engineering teams?|cto|product teams?|b2b tech)\b/i.test(state.company.icp ?? '');

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
export function replyProbability({ tier, stepIndex = 0, quality = 0.6, fit = null, saas = false, contact = {}, aiSdr = false, mult = 1, pain = null }) {
  // mult: list quality beyond fit (trigger timing, wrong persona) and market burn (prospector.js, market-burn.js).
  let p = SALES.replyTier[tier] * stepWeight(stepIndex) * copyMultiplier(quality) * fitMultiplier(fit) * mult;
  // Relevance: people who really have the problem answer cold email about it more often than people who do not [design].
  if (pain === true) p *= 1.25; else if (pain === false) p *= 0.7;
  if (saas) p *= SALES.saasBuyerPenalty;
  if (contact.linkedinConnected) p *= SALES.linkedinConnectedLift;
  if (isRoleAddress(contact.email ?? '')) p *= SALES.roleAddressPenalty.reply;
  if (aiSdr) p *= 0.8;
  return clamp(p, 0, 0.5);
}

/**
 * Share of replies that are positive. pain (true/false, from personForContact) is what the person really has:
 * people with the problem answer "interested"; people without it are polite at most (and warm ones are politer, never pained).
 */
export function positiveShare({ tier, quality = 0.6, fit = null, pain = null, politeness = null }) {
  let v = SALES.positiveShare[tier] * (0.7 + 0.4 * quality) * (fit == null ? 1 : 0.8 + 0.4 * fit);
  if (pain === true) v *= 1.3; else if (pain === false) v *= 0.55 + 0.5 * (politeness ?? 0.25); // politeness lifts "sounds nice", not pain [design]
  return clamp(v, 0.05, 0.6);
}

// Given a reply happened: which kind? r1, r2 uniform draws. pain: the person's real pain (null = unknown).
// A person without the problem is "curious" at best: they cannot honestly be interested in something they do not need.
export function replyKind(pPositive, r1, r2, pain = null) {
  if (r1 < pPositive) {
    if (pain === false) return 'curious';
    return r2 < (pain === true ? Math.min(0.85, SALES.positiveSplit.interested + 0.2) : SALES.positiveSplit.interested) ? 'interested' : 'curious';
  }
  const n = SALES.negativeSplit;
  return r2 < n.not_now ? 'not_now' : r2 < n.not_now + n.objection ? 'objection' : 'unsubscribe';
}

/** True pain of this contact, or null with no market idea (legacy behaviour). */
export function prospectPain(state, contact, company = null) {
  return hasTruth(state) ? personForContact(state, contact, company).hasPain : null;
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
  p *= 0.25 + 0.75 * quality; // [design] an off-point, pushy reply (q ≈ 0.3) books ~1/2.5 the meetings of a direct answer
  if (!hasProduct) p *= 0.75; // discovery calls still happen pre-product, a bit less often
  p *= Math.pow(SALES.repeatAsk.decay, Math.max(0, priorAsks)); // asking again after no answer halves the odds
  return clamp(p, 0, 0.9);
}

// ---- Personas ----

// What a prospect uses today when the Market app knows no tool for them, by who the company sells to [design].
const TOOLS = {
  smb: ['spreadsheets and a shared Google Drive', 'a patchwork of Zapier automations', 'pen, paper and WhatsApp', 'an old desktop app we bought in 2017', 'a part-time VA doing it manually', 'a big all-in-one suite we barely use'],
  ent: ['an internal tool the data team built', 'Salesforce plus spreadsheets', 'a legacy vendor on a 3-year contract', 'a consulting firm', 'ServiceNow workflows', 'manual processes across three teams'],
  startups: ['a script one of our engineers wrote', 'Notion plus a Slack channel', 'an open-source tool we self-host', 'a spreadsheet the ops person owns', 'a couple of Zapier zaps', 'the free tier of a bigger tool'],
  local_smb: ['pen, paper and a wall calendar', 'a spreadsheet my bookkeeper set up', 'texts and WhatsApp', 'the module that came with our POS', 'an old desktop program', 'my office manager, by hand'],
  ecommerce: ['a couple of Shopify apps and a spreadsheet', 'Google Sheets plus a VA', 'manual exports from Shopify every week', 'a Zapier flow that breaks now and then', 'the marketplace dashboards, one by one', 'our 3PL\'s portal and a lot of copy-paste'],
  mid_market: ['Salesforce plus spreadsheets', 'an internal tool a contractor built', 'a legacy vendor we renew every year', 'manual processes across two teams', 'HubSpot workflows and a shared inbox', 'a module of our ERP nobody likes'],
  enterprise: ['an internal tool the data team built', 'a legacy vendor on a 3-year contract', 'a consulting firm', 'ServiceNow workflows', 'manual processes across three teams', 'a module of SAP'],
};
// How a purchase gets approved, by customer type and the person's own authority (truth), in their own words [design].
const DECIDES = {
  startups: { self: 'I decide on tools like this myself, usually within a week if it is under a few hundred a month', influence: 'I can push for it, but the founder signs off on anything recurring', none: 'I would only recommend it; the founder or my manager decides' },
  local_smb: { self: 'I decide, usually after talking it over with my bookkeeper or partner', influence: 'I can suggest it, but the owner signs off on anything recurring', none: 'I would just use it; the owner decides what we pay for' },
  ecommerce: { self: 'I decide, after checking reviews and whether it slows the store down', influence: 'I can push for it, but the owner signs off on new apps', none: 'I would use it, but the owner decides what we install' },
  mid_market: { self: 'I own this budget, but finance approves anything annual and IT reviews anything touching our data', influence: 'I would champion it; my VP and finance approve, IT reviews it', none: 'I would only use it; my director decides, with IT and finance' },
  enterprise: { self: 'it needs a security review, a DPA and procurement; I sign at the end', influence: 'it needs a security review, a DPA and procurement, and a VP signs', none: 'I would use it, but security, procurement and a VP all have to say yes' },
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
  const fit = company.prospect?.fit ?? company.inboundFit ?? company.research?.fit ?? 0.5; // database truth first (prospector.js)
  // Warm intros are hand-picked by people who know the problem exists there: pain is likelier [design].
  // With a market idea, pain/authority/WTP come from the contact's stable hidden person (their TRUE segment); warmth only
  // changes politeness. Without an idea (unit use) the old fit-based draw remains.
  const person = hasTruth(state) ? personForContact(state, contact, company) : null;
  const hasPain = person ? person.hasPain : company.inboundPain != null ? company.inboundPain : u01(seed + 'pain') < clamp(0.2 + 0.7 * fit, 0.1, 0.9);
  const topJob = person?.jobsRanked?.find((j) => !j.decoy && j.id !== 'core');
  // With a hidden person the pain is THEIRS (top job + how they cope today). Your research hypotheses are your guesses
  // about them and never become the prospect's truth; they only stand in when there is no market idea (legacy).
  const job = topJob ? topJob.label.toLowerCase().replace(/^to /, '').replace(/[.\s]+$/, '') : null;
  // The hidden person in their own words: truth.js says "the main job" when the idea's core job ranks first; the person
  // names their concrete job instead. Same facts, so validateReply and the prompts stay consistent.
  const sayJob = (t) => (t && job ? String(t).replace(/get the main job done/g, job) : t);
  const voiced = person ? { ...person, lastIncident: sayJob(person.lastIncident), workaround: sayJob(person.workaround), name: contact.name || contact.firstName || 'the prospect', role: `the ${String(contact.title || 'person who handles this').toLowerCase()}` } : null;
  const truthPain = person && job ? `${job} is a constant hassle${voiced.workaround ? `; right now it is ${String(voiced.workaround).replace(/[.\s]+$/, '')}` : ''}` : null;
  const pains = truthPain ? [truthPain] : person ? [`the part of the work ${state.company.name} is about (${state.company.oneLiner || 'unclear'}) eats more time than it should`]
    : company.research?.pains?.length ? company.research.pains : [`the problem ${state.company.name} solves (${state.company.oneLiner || 'unclear'})`];
  const ctype = customerTypeOf(state);
  const tools = TOOLS[ctype] ?? TOOLS[seg];
  const authority = person ? authorityOfPerson(person) : authorityFor(contact.title);
  const decides = DECIDES[ctype ?? (seg === 'ent' ? 'enterprise' : null)];
  const decisionProcess = person && decides
    ? decides[authority === 'economic buyer' ? 'self' : authority === 'budget influencer / likely champion' ? 'influence' : 'none']
    : seg === 'ent' ? 'needs security review, a DPA and procurement; a VP signs' : /owner|founder|ceo/i.test(contact.title ?? '') ? 'decides alone, usually within a week' : 'the owner signs off on anything recurring';
  // Willingness to pay is set by the BUYER: a reference price for this segment (MARKET.refPrice, monthly:
  // SMB $79, enterprise $1,250) × company size × pain × lognormal noise (σ 0.6). Independent of your list price.
  const refMonthly = customerMarketCfg(MARKET[seg], seg, state.company.customerType).refPrice; // owners pay less than startups; enterprise most (customer type) // monthly-equivalent for every model (ent ≈ $1,250/mo = $15k ACV)
  const employees = employeesOf(company, seg);
  // Real competitive context (Market app): what they use today / have evaluated, deterministic per contact.
  const comp = competitionFor(state, { audience: 'prospect', seed: contact.id ?? company.id ?? seed });
  const uses = comp.uses;
  const strongIncumbent = isStrong(uses);
  const rival = comp.evaluated[0]?.name ?? comp.known.find((k) => k.relation === 'heard_of')?.competitor.name ?? null;
  // True WTP when there is a person (segment median x intensity, set at the buyer); non-authority contacts can only argue for half of it.
  const budgetMonthly = person
    ? Math.max(5, Math.round((hasPain ? Math.max(person.wtpTrue, 0.15 * refMonthly) * sizeFactor(employees) * (person.budgetAuthority ? 1 : 0.5) : 0.08 * refMonthly) * Math.exp(0.15 * normal01(seed + 'b')) * budgetFactor(comp)))
    : Math.max(5, Math.round(refMonthly * sizeFactor(employees) * (hasPain ? 1 : 0.3) * Math.exp(0.6 * normal01(seed + 'b')) * budgetFactor(comp)));
  // Budget is revealed as a stance; a range only after good discovery (see personaSystem / heuristicCallReply).
  const budgetStance = person && hasPain && !person.budgetAuthority ? 'I do not control the budget; whoever signs would have to be convinced' : !hasPain ? 'no budget for this; it is not a priority' : uses && !uses.statusQuo ? `already paying for ${uses.name}; would move that budget only for a clear win` : budgetMonthly < refMonthly ? 'no budget line for this; would have to find it' : 'depends on the ROI; there is some discretionary budget';
  const budgetRange = [Math.max(5, Math.round(budgetMonthly * 0.6 / 10) * 10), Math.max(10, Math.round(budgetMonthly / 10) * 10)];
  const baseTimeline = hasPain ? pickBy(seed + 'tl', TIMELINES) : TIMELINES[3];
  return {
    name: contact.name || contact.firstName || 'the prospect',
    title: contact.title || 'unknown role',
    company: company.name || company.domain || 'their company',
    authority,
    hasPain,
    // hidden truth for callers (never shown to the player): the same facts research and pre-sell use
    person, voiced, segmentId: person?.segmentId ?? null, intensity: person ? person.painIntensity : hasPain ? 0.6 : 0.1,
    // wtpTrue is scaled to company size (a 5,000-seat firm is not a 20-seat shop)
    wtpTrue: person ? (person.hasPain ? Math.round(person.wtpTrue * sizeFactor(employees) * 100) / 100 : 0) : null, statedWtp: person ? Math.round((person.statedWtp ?? 0) * sizeFactor(employees) * 100) / 100 : null, politeness: person?.politeness ?? (contact.warm ? 0.6 : 0.25),
    idiosyncraticAsk: person?.idiosyncraticAsk ?? null,
    pain: hasPain ? pickBy(seed + 'p', pains) : 'nothing pressing in this area; it works well enough',
    // The person's own last incident (truth) when there is one; the legacy pool is spoken in the first person.
    lastIncident: hasPain ? (voiced?.lastIncident ?? pickBy(seed + 'i', ['last month it cost us a full weekend to sort out', 'two weeks ago a customer complained about it', 'we hired a temp for it last quarter', 'it caused a mistake we had to refund', 'it is the reason our ops person works late on Fridays'])) : 'none I can recall',
    currentTools: uses ? uses.name : pickBy(seed + 't', tools),
    budgetMonthly, budgetStance, budgetRange, employees,
    // Status-quo users (spreadsheets…) switch easily but feel less urgency.
    timeline: uses?.statusQuo && baseTimeline === TIMELINES[0] ? TIMELINES[1] : baseTimeline,
    objection: uses && !uses.statusQuo ? (strongIncumbent ? `we already pay for ${uses.name} and moving everything off it is a big project` : `we already use ${uses.name}; why switch?`) : pickBy(seed + 'o', OBJECTIONS),
    incumbent: uses ? { name: uses.name, statusQuo: Boolean(uses.statusQuo), strong: strongIncumbent } : null,
    rival,
    competitorNames: comp.names,
    competitionBrief: comp.brief,
    decisionProcess,
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
    case 'interested':
      // Only a person who really has the problem says so; the rest are polite and ask what it is (never invent a pain).
      return persona.hasPain
        ? v([`Hi ${sender}, timing is decent: ${persona.pain}. What does it cost and how long does setup take?${sig}`, `This is actually relevant. We use ${persona.currentTools} today and it's clunky. Happy to hear more.${sig}`])
        : v([`Hi ${sender}, not a fire right now, but the timing is fine to look. What does it cost and how long does setup take?${sig}`, `Thanks ${sender}. Not something we struggle with, but happy to look. How does it work?${sig}`, `Interesting. We use ${persona.currentTools} and it's fine for now. What does it cost?${sig}`]);
    case 'curious': return persona.rival ? `How are you different from ${persona.rival}?${sig}` : v([`How is this different from ${persona.currentTools}?${sig}`, `Maybe. Who else like us uses it?${sig}`, `What exactly would we have to change on our side?${sig}`]);
    case 'objection': return persona.incumbent && !persona.incumbent.statusQuo ? `We already use ${persona.incumbent.name}. Not worth switching right now.${sig}` : v([`Not convinced, ${persona.objection}.${sig}`, `We're fine with ${persona.currentTools} for now.${sig}`]);
    case 'not_now': return v([`Not a priority right now. Maybe check back next quarter.${sig}`, `Busy season here. Ping me in a few months.${sig}`]);
    case 'unsubscribe': return v(['Please remove me from your list.', 'Not interested. Stop emailing me.', `Wrong person, and please take me off this list.`]);
    case 'ooo': return `I'm out of the office with limited access to email and will reply when I'm back. ${company?.name ? `For urgent matters contact the ${company.name} team.` : ''}`.trim();
    case 'hallucination': return v([`We don't use any of the tools you mentioned. Did a bot write this?`, `None of that is true about us. Please remove me.`]);
    default: return `Thanks.${sig}`;
  }
}

/** A deterministic 0..1 stream from a string (hash-based: never touches rng(state)). */
export const streamOf = (seed) => { let i = 0; return () => u01(`${seed}:${i++}`); };

// Deterministic fallback for the prospect answering the founder in Mail. With a hidden person, a question is answered
// by the same offline interviewee the research app uses (data/persona-prompts.js offlineAnswer): it reacts to what was
// actually asked (a specific past question earns one real fact, a leading or hypothetical one gets fluff, a repeat gets
// "you asked me that"), so two prospects never answer word for word alike and a sharper email earns more.
// history: [{ from: 'me'|'them', text, revealed? }] (oldest first, excluding founderText). Returns the text; with
// { detail: true } returns { text, revealed }.
export function fallbackThreadReply({ kind, persona, meeting, slotText, asked, founderText, history = [], seed = '', detail = false }) {
  const first = (persona.name || '').split(' ')[0];
  const sig = first ? `\n\n${first}` : '';
  const out = (text, revealed = []) => (detail ? { text, revealed } : text);
  if (kind === 'unsubscribe') return out(`I asked to be removed. Please stop.${sig}`);
  if (meeting) return out(`OK, let's do ${slotText}. ${pickBy(`${seed}:mt`, ['20 minutes max, and please keep it about our situation, not a slide deck.', 'Send the invite. Bring something you can show, not slides.', 'Works. I have a hard stop after 30 minutes.', 'Fine. Please come with questions about how we do it today.'])}${sig}`);
  if (asked) {
    if (kind === 'not_now' || kind === 'objection') return out(`Not going to make time for this right now. ${persona.objection[0].toUpperCase() + persona.objection.slice(1)}.${sig}`);
    return out(`${pickBy(`${seed}:ask`, ['Can you just send a couple of lines on how it works and the price? I\'ll take a look when I get a minute.', 'Before a call: what does it cost and what would we have to change on our side?', `Not yet. How is it different from ${persona.currentTools}?`, 'Email me the short version first. If it fits I will find 20 minutes.'])}${sig}`);
  }
  const qs = /\?/.test(founderText);
  if (qs && persona.person) {
    const person = persona.voiced ?? { ...persona.person, name: persona.name, role: persona.title };
    const r = offlineAnswer(person, founderText, history, streamOf(`${seed}:${history.length}`));
    return out(`${r.reply}${sig}`, r.revealed ?? []);
  }
  if (qs && persona.hasPain) return out(`Honestly, ${persona.pain}. We use ${persona.currentTools}. ${persona.lastIncident[0].toUpperCase() + persona.lastIncident.slice(1)}.${sig}`);
  if (qs) return out(`It's not a big problem for us. We use ${persona.currentTools} and it's fine.${sig}`);
  return out(words(founderText) > 120 ? `That's a lot of text. What's the one thing you want from me?${sig}` : `${pickBy(`${seed}:noted`, ['Noted.', 'OK, thanks.', 'Got it.', 'Thanks. Will read it properly later.'])}${sig}`);
}
