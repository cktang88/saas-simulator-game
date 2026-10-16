// Customer panel (AI trial users), onboarding economics, churn-reason survey and feedback helpers. Pure.
//
// Sources: docs/research/hr-legal-product.md §3.4 (onboarding/activation), core/params.js ONBOARDING.
// Booking shares and feedback rates below are [A] design assumptions, not statistics.

import { clamp, words, hash } from '../../core/util.js';
import { truthOf, drawPerson } from '../../core/truth.js';
import { shippedFeatures } from '../../core/market.js';
import { buildPanel, SEAT_LABEL } from '../website/personas.js';
import { personForContact, hasTruth } from '../sales/truth-persona.js';
import { acceptanceList } from './spec.js';
import { featureValue } from './fit.js';
import * as insightsModel from '../insights/model.js';
const { activationRate } = insightsModel;

// Share of new trials that accept/book an onboarding slot [A]. "Optional kickoff call" is offered to
// everyone but most self-serve users skip it; concierge is the pitch, so most accept.
export const BOOKING_SHARE = { self: 0, call: 0.35, concierge: 0.75 };
// When a booked call is not held (founder never joined), the trial converts worse than self-serve [A].
export const UNATTENDED_PENALTY = 0.7;
// Customer feedback stream [A]: chance per active account per day of an unsolicited email.
export const FEEDBACK = { perAccountDaily: 0.004, maxPerDay: 1, ignoreDays: 5, cancelIfIgnored: 0.25, surveyResponse: 0.3, cancelEmailShare: 0.4, winBack: 0.25, churnMultIfHelped: 0.7 };

export const PANEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['activated', 'ahaMoment', 'wouldPay', 'willingnessToPayMonthly', 'missingMustHaves', 'featureVerdicts', 'churnRisk', 'quote', 'vsAlternative'],
  properties: {
    activated: { type: 'boolean', description: 'Did you reach a moment of real value during the trial?' },
    ahaMoment: { type: 'string', description: 'The specific moment you got value, or "none"' },
    wouldPay: { type: 'boolean', description: 'Would you pay the stated price when the trial ends?' },
    willingnessToPayMonthly: { type: 'number', description: 'USD per month you would realistically pay, 0 if nothing' },
    missingMustHaves: { type: 'array', items: { type: 'string' }, description: 'Things you need before paying' },
    featureVerdicts: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['feature', 'verdict'], properties: { feature: { type: 'string' }, verdict: { type: 'string', enum: ['useful', 'meh', 'irrelevant'] } } },
    },
    churnRisk: { type: 'number', description: '0-1: probability you cancel within 3 months if you do pay' },
    quote: { type: 'string', description: 'One blunt sentence in your own voice' },
    vsAlternative: { type: 'string', description: 'How it compares to what you use or know today (switching cost, missing parity, cheaper/free options); "none" if you know no alternative' },
  },
};

// Legacy one-line roles (kept for old saved panels and callers that pass a bare { id, role, context }).
const ARCHETYPES = {
  b2c: ['a busy person who signed up from an ad on their phone and gives apps 2 minutes', 'a price-sensitive user who already uses a free alternative', 'an enthusiast who has tried several similar apps this year'],
  smb: ['a small-business owner who deals with this problem themselves after hours', 'an operations manager at a 20-person company evaluating tools for the team', 'a skeptical owner who churned from a similar SaaS tool last year'],
  ent: ['a director who would champion a new tool internally', 'a hands-on team lead who would use it daily', 'an IT/security reviewer who must approve new vendors'],
};
export const LEGACY_ARCHETYPES = ARCHETYPES;

const h01 = (s) => (parseInt(hash(String(s)), 36) % 1e6 + 0.5) / 1e6;
const pickH = (arr, key) => arr[Math.floor(h01(key) * arr.length) % arr.length];

// The hidden person behind a trial panelist: drawn from the market truth for the panelist's own segment (never rendered).
function trialHidden(state, p, key) {
  const t = truthOf(state);
  if (!t?.segments?.length || !p.segmentId) return null;
  const id = p.type === 'consumers' ? `p:${p.segmentId}` : p.segmentId;
  const candidates = t.segments.filter((x) => x.id === id || x.baseId === p.segmentId);
  const seg = candidates.length ? pickH(candidates, `${key}:seg`) : null;
  const d = drawPerson(state, { segmentId: seg ? seg.id : 'outsider', channel: 'panel', seedKey: `trial-panel:${key}` });
  return { segmentId: d.segmentId, hasPain: d.hasPain, painIntensity: d.painIntensity, lastIncident: d.lastIncident, lastIncidentDays: d.lastIncidentDays, workaround: d.workaround, wtpTrue: d.wtpTrue, isBuyer: d.isBuyer, budgetAuthority: d.budgetAuthority, priorities: d.competingPriorities };
}

/**
 * Trial panelists: four different people for the company's customer type (user, champion, economic buyer, skeptic:
 * the same archetypes, names, segments and companies the Website panel uses, apps/website/personas.js) plus up to two
 * real CRM contacts. Each has their own job-to-be-done, current tools, history, price sensitivity and deal-breakers,
 * and a hidden person from the market truth (pain, workaround, true WTP). A new product (shipped feature set) gets a
 * new cohort. `hidden` never reaches the UI.
 */
export function buildPersonas(state) {
  const icp = state.company.icp || state.company.oneLiner || 'the company\'s target customer';
  const cohort = hash(shippedFeatures(state).map((f) => f.id).sort().join(','));
  let seats = [];
  try { seats = buildPanel(state, `trial:${cohort}`); } catch { seats = []; }
  const out = seats.length
    ? seats.map((p) => ({
      id: `trial_${p.seat}`, source: 'icp', name: p.name, seat: p.seat, key: p.key, voice: p.voice, type: p.type,
      title: p.title, company: p.company, segmentId: p.segmentId,
      role: `${p.name}, ${p.title}${p.company ? ` at ${p.company}` : ''} (${SEAT_LABEL[p.seat].toLowerCase()})`,
      jtbd: p.jtbd, uses: p.uses, burnedBy: p.burnedBy, skeptical: p.skeptical, priceSens: p.priceSens, tech: p.tech, needs: p.needs, cares: p.cares, device: p.device, biases: p.biases,
      context: icp, hidden: trialHidden(state, p, `${cohort}:${p.seat}`),
    }))
    : (ARCHETYPES[state.company.model] ?? ARCHETYPES.smb).map((role, i) => ({ id: `icp${i}`, source: 'icp', name: null, role, context: icp }));
  const crm = state.apps.crm;
  if (crm?.companies?.length) {
    const cos = crm.companies.slice().sort((a, b) => (b.website?.text || b.siteText ? 1 : 0) - (a.website?.text || a.siteText ? 1 : 0)).slice(0, 2);
    for (const c of cos) {
      const contact = (crm.contacts ?? []).find((p) => p.companyId === c.id && !p.hidden);
      const site = c.website?.text ?? c.siteText ?? c.site?.text ?? '';
      let hidden = null;
      if (contact && hasTruth(state)) { try { const d = personForContact(state, contact, c); hidden = { segmentId: d.segmentId, hasPain: d.hasPain, painIntensity: d.painIntensity, lastIncident: d.lastIncident, lastIncidentDays: d.lastIncidentDays, workaround: d.workaround, wtpTrue: d.wtpTrue, isBuyer: d.isBuyer, budgetAuthority: d.budgetAuthority, priorities: d.competingPriorities }; } catch { hidden = null; } }
      out.push({
        id: `crm_${c.id}`, source: 'crm', name: c.name, crmCompanyId: c.id, seat: hidden ? (hidden.budgetAuthority ? 'economic_buyer' : hidden.isBuyer ? 'champion' : 'user') : null,
        role: `${contact?.title || 'the person who would buy'} at ${c.name}${c.industry ? ` (${c.industry})` : ''}${c.size || c.employees ? `, ~${c.size ?? c.employees} employees` : ''}`,
        context: `${icp}\nAbout ${c.name}: ${String(site || c.description || c.notes || '').slice(0, 1200)}`,
        hidden,
      });
    }
  }
  return out;
}

const SENS = (x) => (x >= 0.8 ? 'very price sensitive: every subscription is scrutinised' : x >= 0.55 ? 'price conscious' : x >= 0.3 ? 'careful with price, but value matters more' : 'not paying out of your own pocket, so price barely matters to you');
const ago = (d) => (d == null ? null : d <= 1 ? 'yesterday' : d < 14 ? `${d} days ago` : d < 60 ? `about ${Math.round(d / 7)} weeks ago` : `about ${Math.round(d / 30)} months ago`);

/** One system prompt per trial panelist: who they are, their history and (privately) their real pain. */
export function trialSystemPrompt(p, { realism = '', bugs = false, compBrief = '', rubric = '' } = {}) {
  const h = p.hidden;
  const pain = !h ? ''
    : h.hasPain ? `PRIVATE (never quote it, let it shape you): you really have this problem (how much it hurts, 0-1: ${h.painIntensity}).${h.lastIncident ? ` Last time: ${h.lastIncident}.` : ''}${h.workaround ? ` Today you cope with ${h.workaround}.` : ''} A product that removes that gets a real try from you; one that only shows data you already have does not.`
      : `PRIVATE (never quote it): you do not really have this problem right now; your priorities are ${(h.priorities ?? []).join(', ') || 'elsewhere'}. Only something obviously better than what you do today would get you to keep using it.`;
  const who = p.seat
    ? `You are ${p.role}. Your job-to-be-done: ${p.jtbd}. What you use today: ${p.uses}. A bad experience you have not forgotten: ${p.burnedBy}. You are skeptical of: ${p.skeptical}. Money: you are ${SENS(p.priceSens ?? 0.5)}.${p.biases?.length ? ` ${p.biases.join(' ')}` : ''}`
    : `You are ${p.role}. Context: ${p.context}`;
  return `${realism}
${who}
The company is going after: ${p.context?.split('\n')[0] ?? ''}.
The year is 2026. You signed up for a trial and used the product for a week alongside your real work. You only know what is below; if a feature isn't listed it does not exist.${bugs ? ' The product was buggy in places.' : ''}
${pain}
${compBrief ? `What you use and know today: ${compBrief} Compare honestly: switching cost (data, habits, team), features you'd lose vs. what you use now, and whether an alternative does this cheaper or free. Status quo inertia is strong.` : 'You know of no dedicated tool for this; your alternative is doing it by hand or not at all.'}
Write the quote, aha moment and missing must-haves in your own voice as this person, from your seat and your history. Do not coach the founder.
${rubric}`;
}

// What a panelist is allowed to see: shipped specs, website text, price, onboarding mode. Nothing else.
export function trialBrief(state, features) {
  const site = state.company.website;
  const siteTxt = site ? [site.title, site.description, (site.headings ?? []).join(' | '), site.text].filter(Boolean).join('\n').slice(0, 4000) : '(no website)';
  const plans = state.plans.filter((p) => p.active).map((p) => `${p.name}: $${p.price}/${p.interval}${p.trialDays ? `, ${p.trialDays}-day trial` : ''}`).join('; ');
  const ob = { self: 'self-serve (no human help)', call: 'self-serve with an optional 30–45 min kickoff call with the founder', concierge: 'concierge: the founder sets it up with you (~2 hours)' }[state.market?.onboarding ?? 'self'];
  // Behaviour only: title, the trigger→action sentence and the integrations — not the founder's AC prose.
  const integ = (f) => (`${f.solution} ${acceptanceList(f).join(' ')}`.match(/\b(quickbooks|xero|shopify|gmail|outlook|google (sheets|calendar|drive)|stripe|salesforce|hubspot|slack|jobber|sms|csv|pdf|api|webhook)\b/gi) ?? []).map((x) => x.toLowerCase());
  const feats = features.map((f, i) => `${i + 1}. ${f.title}\n   Does: ${f.solution}${integ(f).length ? `\n   Works with: ${[...new Set(integ(f))].join(', ')}` : ''}`).join('\n');
  return `=== WEBSITE ===\n${siteTxt}\n=== PRICE ===\n${plans}${state.market?.cardRequired ? ' (card required to start the trial)' : ' (no card needed for the trial)'}\n=== ONBOARDING ===\n${ob}\n=== WHAT THE PRODUCT ACTUALLY DOES (shipped features only) ===\n${feats}\nIf the product only displays data you already have, you would not pay.`;
}

const tokens = (s) => new Set(String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
const seedOf = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return (h % 1000) / 1000; };

// Offline quotes per voice family (the Website panel's families) and trial outcome, in the panelist's own words.
// {feature} the feature that worked for them, {uses} what they use today, {ago} their last incident. [design] wording.
const TRIAL_VOICE = {
  builder: { yesPain: 'Wired "{feature}" into our setup in an afternoon and it took over a chore I hated. I\'d keep it if the API holds up.', yes: '"{feature}" works, but honestly {uses} already covers most of it.', noPain: 'Got stuck before anything useful happened. I\'d still rather script this myself than fight the setup.', no: 'Poked at it for ten minutes. Nothing here I need.' },
  doer: { yesPain: 'The first time "{feature}" did the boring part for me I actually said "finally". That chunk of my week is gone.', yes: '"{feature}" is nice. I wasn\'t really struggling before, though.', noPain: 'This bit me {ago} and I wanted it gone, but I couldn\'t get it to work on my real stuff.', no: 'I used it twice and forgot about it.' },
  operator: { yesPain: 'I can see the team using "{feature}". I\'d want two more weeks before I push my boss for it.', yes: '"{feature}" is fine, but I can\'t make a case to switch the team off {uses} for it.', noPain: 'The problem is real for my team, but I never got it set up for more than just me.', no: 'It didn\'t touch anything my team is struggling with.' },
  owner: { yesPain: '"{feature}" saved me an evening this week. If it keeps doing that, it pays for itself.', yes: 'Works fine. We were getting by with {uses}, so I\'m not sure it\'s worth another bill.', noPain: 'I gave it one evening after closing and couldn\'t get it going. No time for a second try.', no: 'Didn\'t see how this fits my week.' },
  founder: { yesPain: '"{feature}" replaced something someone on the team did by hand. That\'s the bar, and it cleared it.', yes: 'It works. It doesn\'t replace a cost or a hire, so it\'s a nice-to-have.', noPain: 'We do lose time to this, but the trial never got to the part that saves it.', no: 'Not a priority for us. Cancelled the trial.' },
  money: { yesPain: 'If "{feature}" keeps saving what it saved this week, the number works. Send me the annual price.', yes: 'Fine product. I don\'t see the saving against {uses} yet.', noPain: 'The cost of the problem is real, but I saw no result I could put in a business case.', no: 'No measurable result in the trial, so no budget line.' },
  gatekeeper: { yesPain: '"{feature}" works and it would help us. It still has to clear our vendor review.', yes: 'Nothing broke. Nothing about it makes me want to start a vendor review either.', noPain: 'We have this problem, but I couldn\'t see how it handles our data, so I stopped.', no: 'One more vendor to review for a problem we have handled. Pass.' },
  consumer: { yesPain: 'Ok, "{feature}" is actually useful. I opened it again on day three without a reminder.', yes: 'It\'s fine. {uses} is free and does most of this.', noPain: 'I wanted this to work but the setup lost me.', no: 'Deleted it after a day.' },
};
const SIGNAL_RX = {
  docs: [/\b(api|docs?|documentation|webhook|sdk)\b/, 'Docs or an API I can read before committing'],
  security: [/\b(sso|saml|soc ?2|audit log|permission|roles?|encrypt|security)\b/, 'SSO, roles and a security answer IT will accept'],
  integrations: [/\b(integrat|sync|import|connect|api|webhook)\b/, 'Works with the tools I already use (import/sync)'],
  setup: [/\b(onboard|setup|set up|template|wizard|import)\b/, 'A setup I can finish without a call'],
  human: [/\b(support|chat|phone|call)\b/, 'A real person to call when it breaks'],
  roi: [/\b(report|dashboard|saving|roi|export)\b/, 'A report that shows what it saved'],
  cancel: [/\b(cancel|monthly|no contract)\b/, 'Clear terms for cancelling'],
  mobile: [/\b(mobile|phone|ios|android|app)\b/, 'Something that works on my phone'],
  privacy: [/\b(privacy|gdpr|delete|data export|local)\b/, 'What happens to my data, in plain words'],
  speed: [/\b(fast|speed|performance|lightweight)\b/, 'Proof it doesn\'t slow the store down'],
  price: [/$^/, null], proof: [/$^/, null], numbers: [/$^/, null],
};

// Deterministic offline panelist (same shape as PANEL_SCHEMA). With a seated persona (buildPersonas) the hidden person,
// seat, price sensitivity, deal-breakers and voice make each panelist react differently to the same product; a bare
// legacy persona { id, role, context } keeps the older behaviour.
export function heuristicTrial(state, persona, features, { openBugHours = 0, refPrice = 79, priceMonthly = 79, known = [] } = {}) {
  const jitter = seedOf(persona.id + features.map((f) => f.id).join());
  const icp = `${state.company.icp} ${state.company.oneLiner}`;
  const insights = state.apps.research?.insights ?? [];
  const h = persona.hidden ?? null;
  // Pain shifts how much a feature is worth to THIS person [design]: someone who lives the problem finds it useful sooner.
  const painAdj = h ? (h.hasPain ? 0.04 + 0.08 * (h.painIntensity ?? 0.5) : -0.1) : 0;
  // Usefulness = value delivered (relevance × does it remove their workaround), not how well the spec reads.
  const verdicts = features.map((f) => {
    const u = featureValue(f, { icp, insights }) + 0.15 * (jitter - 0.5) - Math.min(0.2, openBugHours / 400) + painAdj;
    return { feature: f.title, verdict: u > 0.45 ? 'useful' : u > 0.25 ? 'meh' : 'irrelevant', u };
  });
  const useful = verdicts.filter((v) => v.verdict === 'useful').length;
  const usefulShare = features.length ? useful / features.length : 0;
  const ob = state.market?.onboarding ?? 'self';
  const skeptic = persona.seat ? persona.seat === 'skeptic' : /skeptical|price-sensitive|security|churned/.test(persona.role);
  const all = features.map((f) => `${f.title} ${f.solution ?? ''} ${acceptanceList(f).join(' ')}`).join(' ').toLowerCase();
  // A deal-breaker the product does not cover stops this person at the door (the engineer without docs, IT without SSO).
  const blockers = (persona.needs ?? []).filter((k) => SIGNAL_RX[k]?.[1] && !SIGNAL_RX[k][0].test(all));
  // Same activation model as Product analytics (incl. the player's lifecycle-email/onboarding-experiment lift) (benchmark 37.5%), driven by the market's (hidden) fit; max 0.6.
  const pAct = clamp(activationRate({ fit: state.market?.fit?.product?.score ?? 0.3, onboarding: ob, lift: insightsModel.activationLift?.(state) ?? 0 }) - (state.company.website ? 0 : 0.1) - (skeptic ? 0.1 : 0)
    + (h ? (h.hasPain ? 0.08 : -0.08) : 0) - 0.08 * blockers.length + (persona.seat === 'user' ? 0.03 : 0), 0.02, 0.6);
  const alt = incumbentAlternative(known);
  const switching = alt ? (alt.statusQuo ? 0.05 : 0.12) : 0; // [design] switching cost from what they already use
  const activated = useful > 0 && jitter < pAct - switching;
  const sens = persona.priceSens != null ? 1.25 - 0.6 * persona.priceSens : persona.role.includes('price-sensitive') ? 0.5 : 1;
  const painMult = h ? (h.hasPain ? 1.15 : 0.6) : 1;
  const wtp = Math.round(refPrice * (0.25 + 0.9 * usefulShare) * (0.6 + 0.6 * jitter) * sens * painMult * (activated ? 1 : 0.5));
  const missing = [
    ...blockers.map((k) => SIGNAL_RX[k][1]),
    !blockers.includes('integrations') && !/integrat|sync|import|connect|api/.test(all) && 'Works with the tools I already use (import/sync)',
    !/team|invite|share|role|permission/.test(all) && state.company.model !== 'b2c' && persona.seat !== 'user' && 'A way to share it with my team',
    !/export|csv|pdf|report/.test(all) && (persona.seat ? ['economic_buyer', 'champion'].includes(persona.seat) : true) && 'Export or a report I can show someone',
    openBugHours > 40 && 'It needs to stop breaking',
    alt && !alt.statusQuo && `Parity with ${alt.name} before I switch`,
  ].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 2);
  const altPrice = alt?.priceMonthlyUSD;
  const cheaper = alt && !alt.statusQuo && (alt.freeTier || (altPrice != null && altPrice < priceMonthly));
  const wtpAdj = cheaper ? Math.round(wtp * 0.75) : wtp;
  const best = verdicts.slice().sort((a, b) => b.u - a.u)[0];
  const usesNow = String(alt?.name ?? persona.uses ?? 'what I use now').split(/[;,]/)[0];
  const voice = TRIAL_VOICE[persona.voice];
  const fillQ = (t) => t.replace('{feature}', best?.feature ?? 'it').replace('{uses}', usesNow).replace('{ago}', ago(h?.lastIncidentDays) ?? 'recently');
  const quote = voice
    ? fillQ(activated ? (h?.hasPain ? voice.yesPain : voice.yes) : (h?.hasPain ? voice.noPain : voice.no))
    : activated ? 'It did one thing I need. Not sure yet it is worth the price.' : 'I poked around and did not see how this fits my week.';
  const wa = h?.workaround ? String(h.workaround).replace(/[.\s]+$/, '') : null;
  return {
    activated,
    ahaMoment: activated ? (wa && h?.hasPain ? `When "${best?.feature}" did what I normally do with ${wa}.` : `When "${verdicts.find((v) => v.verdict === 'useful')?.feature}" worked on my own data.`) : 'none',
    wouldPay: activated && wtpAdj >= priceMonthly && seedOf(persona.id + 'pay') < (h ? (h.hasPain ? 0.65 : 0.25) : 0.5),
    willingnessToPayMonthly: wtpAdj,
    missingMustHaves: missing,
    featureVerdicts: verdicts.map(({ feature, verdict }) => ({ feature, verdict })),
    churnRisk: clamp(0.75 - 0.5 * usefulShare + openBugHours / 500 - (activated ? 0.15 : 0) + (h ? (h.hasPain ? -0.05 : 0.1) : 0), 0.05, 0.95),
    quote,
    vsAlternative: !alt ? 'none' : alt.statusQuo ? `Today I use ${alt.name}. It's clunky but free and I already know it.` : `I already use ${alt.name}${alt.freeTier ? ' (it has a free tier)' : altPrice ? ` at about $${altPrice}/mo` : ''}. Switching means moving my data and retraining${cheaper ? ', and it costs less' : ''}.`,
  };
}

// What the persona uses today (from Market's knownCompetitors): the competitor object, or null.
export function incumbentAlternative(known = []) {
  return known.find((k) => k.relation === 'uses')?.competitor ?? null;
}

// Competitors a churning customer could realistically switch to: meaningful share only, weighted by
// share × momentum [design]. Returns [{ name, w }].
export const MEANINGFUL_SHARE = 0.03;
export function switchTargets(list = []) {
  return list.filter((c) => !c.statusQuo && (c.marketShare ?? 0) >= MEANINGFUL_SHARE)
    .map((c) => ({ name: c.name, w: c.marketShare * (c.momentum === 'rising' ? 1.5 : c.momentum === 'declining' ? 0.5 : 1) }));
}
export function pickSwitchTarget(rand, targets) {
  const tot = targets.reduce((a, t) => a + t.w, 0);
  if (!tot) return null;
  let r = rand() * tot;
  for (const t of targets) { r -= t.w; if (r <= 0) return t.name; }
  return targets.at(-1).name;
}

// Aggregate panelist results → product fit (0..1), median WTP of activated panelists, top must-haves.
export function aggregatePanel(results, priceMonthly) {
  const n = results.length;
  if (!n) return null;
  const rate = (fn) => results.filter(fn).length / n;
  const activation = rate((r) => r.activated);
  const payRate = rate((r) => r.wouldPay);
  const verdicts = results.flatMap((r) => r.featureVerdicts ?? []);
  const usefulShare = verdicts.length ? verdicts.filter((v) => v.verdict === 'useful').length / verdicts.length : 0;
  const risk = (r) => (typeof r.churnRisk === 'number' && Number.isFinite(r.churnRisk) ? r.churnRisk : Number(r.churnRisk) || 0.5); // 0 is a real answer
  const churnRisk = results.reduce((a, r) => a + clamp(risk(r), 0, 1), 0) / n;
  const missingAvg = results.reduce((a, r) => a + (r.missingMustHaves?.length ?? 0), 0) / n;
  const raw = clamp((0.3 * activation + 0.3 * usefulShare + 0.25 * payRate + 0.15 * (1 - churnRisk)) * clamp(1 - 0.08 * missingAvg, 0.6, 1), 0, 1);
  // Small panels shrink toward the base rate (review P7): (n·raw + 4·0.35)/(n + 4).
  const score = n <= 10 ? (n * raw + 4 * 0.35) / (n + 4) : raw;
  const wtps = results.filter((r) => r.activated && r.willingnessToPayMonthly > 0).map((r) => r.willingnessToPayMonthly).sort((a, b) => a - b);
  const wtp = wtps.length ? wtps[Math.floor(wtps.length / 2)] : null;
  const counts = {};
  for (const r of results) for (const m of r.missingMustHaves ?? []) { const k = String(m).trim(); if (k) counts[k] = (counts[k] ?? 0) + 1; }
  const mustHaves = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([text, count]) => ({ text, count }));
  const perFeature = {};
  for (const v of verdicts) { const p = (perFeature[v.feature] ??= { useful: 0, meh: 0, irrelevant: 0 }); p[v.verdict] = (p[v.verdict] ?? 0) + 1; }
  return { score, raw, activation, payRate, usefulShare, churnRisk, wtp, mustHaves, perFeature, n, priceMonthly, useful: usefulShare >= 0.4 };
}

// ---- Churn-reason survey ----
export const CANCEL_CATEGORIES = {
  too_expensive: 'Too expensive for the value',
  missing_feature: 'Missing a feature I need',
  not_using: 'Didn\'t use it enough / never set it up',
  bugs: 'Bugs or reliability',
  switched: 'Switched to another tool (or a free AI feature)',
  no_longer_needed: 'No longer need it (business changed)',
  felt_ignored: 'Support didn\'t respond',
  payment_failed: 'Payment failed (involuntary)',
};
// Weighted reason for a cancellation given the current state of the product. rand: () => [0,1).
export function cancelCategory(rand, { reason, priceRatio = 1, productScore = 0.4, bugHours = 0, onboarding = 'self', wrapper = false, competitorShare = 0 }) {
  if (reason === 'felt_ignored') return 'felt_ignored';
  if (/payment|fail|past_due|declin/i.test(reason ?? '')) return 'payment_failed';
  const w = {
    too_expensive: 1 + 2 * Math.max(0, priceRatio - 1),
    missing_feature: 1 + 2 * (1 - productScore),
    not_using: (reason === 'trial_not_converted' ? 2.5 : 1) * (onboarding === 'self' ? 1.4 : 0.7),
    bugs: 0.3 + bugHours / 60,
    switched: 0.3 + 3 * Math.min(0.6, competitorShare) + (wrapper ? 1.5 : 0), // meaningful rivals pull churners away [design]
    no_longer_needed: 0.6,
  };
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
  return 'no_longer_needed';
}

// ---- Replies to customers (fallback judge for reply:customer) ----
export function heuristicReplyQuality(body, type) {
  const t = String(body ?? '').toLowerCase();
  const n = words(t);
  let s = 0.2;
  if (n >= 25) s += 0.15;
  if (n > 250) s -= 0.1;
  if (/\b(fixed|shipped|deployed|live now|patched|resolved)\b/.test(t)) s += 0.25;
  if (/\b(today|tomorrow|this week|by (monday|tuesday|wednesday|thursday|friday)|within \d+|in \d+ (hours|days))\b/.test(t)) s += 0.15;
  if (/\?/.test(t)) s += 0.1; // asks to understand
  if (/\b(sorry|apolog|my fault|our fault|thanks for)\b/.test(t)) s += 0.05;
  if (/\b(workaround|in the meantime|for now you can)\b/.test(t)) s += 0.1;
  if (type === 'cancel' && /\b(refund|discount|free month|credit|pause)\b/.test(t)) s += 0.15;
  if (/\b(we value your feedback|we will consider|on our roadmap|stay tuned)\b/.test(t) && n < 40) s -= 0.2; // canned
  return clamp(s, 0, 1);
}
