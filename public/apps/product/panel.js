// Customer panel (AI trial users), onboarding economics, churn-reason survey and feedback helpers. Pure.
//
// Sources: docs/research/hr-legal-product.md §3.4 (onboarding/activation), core/params.js ONBOARDING.
// Booking shares and feedback rates below are [A] design assumptions, not statistics.

import { clamp, words } from '../../core/util.js';
import { acceptanceList } from './spec.js';
import { featureValue } from './fit.js';
import * as insightsModel from '../insights/model.js';
import { buildPanel, SEAT_LABEL } from '../website/personas.js';
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

// Panelists are the same kind of concrete people as the Website panel (apps/website/personas.js): one per buying seat
// (user, champion, economic buyer, skeptic), built from the company's customer type, a buyer segment and a hidden
// person drawn from the market truth (drawPerson). The seed key 'trial' seats different people from the landing-page
// panel. Up to two real CRM companies join them (using their fetched website text if present).
const TRIAL_KEY = 'trial';
const publicRole = (p) => `${p.name}, ${p.title}${p.company ? ` at ${p.company}` : ''} (${(SEAT_LABEL[p.seat] ?? 'trial user').toLowerCase()})`;

export function buildPersonas(state) {
  const icp = state.company.icp || state.company.oneLiner || 'the company\'s target customer';
  const out = buildPanel(state, TRIAL_KEY).map((p, i) => ({ ...p, id: `icp${i}`, source: 'icp', role: publicRole(p), context: icp }));
  const crm = state.apps.crm;
  if (crm?.companies?.length) {
    const cos = crm.companies.slice().sort((a, b) => (b.website?.text || b.siteText ? 1 : 0) - (a.website?.text || a.siteText ? 1 : 0)).slice(0, 2);
    for (const c of cos) {
      const contact = (crm.contacts ?? []).find((p) => p.companyId === c.id && !p.hidden);
      const site = c.website?.text ?? c.siteText ?? c.site?.text ?? '';
      out.push({
        id: `crm_${c.id}`, source: 'crm', name: c.name, crmCompanyId: c.id,
        role: `${contact?.title || 'the person who would buy'} at ${c.name}${c.industry ? ` (${c.industry})` : ''}${c.size || c.employees ? `, ~${c.size ?? c.employees} employees` : ''}`,
        context: `${icp}\nAbout ${c.name}: ${String(site || c.description || c.notes || '').slice(0, 1200)}`,
      });
    }
  }
  return out;
}

// What a trial user in each seat checks before paying (signal ids from website/personas.js `needs`) and how the
// offline judge finds it in the shipped features. [design]
const NEED_RX = {
  integrations: [/integrat|sync|import|connect|\bapi\b|webhook|quickbooks|xero|shopify|stripe|gmail|outlook|slack/, 'it working with the tools I already use'],
  docs: [/\bapi\b|webhook|docs|sdk|\bcli\b/, 'an API or docs I can build on'],
  security: [/\bsso\b|saml|soc ?2|permission|\broles?\b|audit|encrypt/, 'SSO, permissions or an audit trail'],
  privacy: [/privacy|delete (my|your|their) data|encrypt|on[- ]device|local only/, 'a clear answer on what happens to my data'],
  setup: [/import|template|onboard|setup|set up|wizard/, 'someone or something that sets it up for me'],
  mobile: [/mobile|phone|\bios\b|android|\bsms\b/, 'something that works on my phone'],
  roi: [/report|dashboard|saved|summary/, 'a report showing what it saved us'],
};

/** The trial user's own system prompt: who they are, their seat, their history and (privately) their pain. */
export function trialSystemPrompt(p, { realism = '', compBrief = '', bugs = 0, rubric = '' } = {}) {
  const situation = `The year is 2026. You signed up for a trial and used the product for a week alongside your real work. You only know what is below; if a feature isn't listed it does not exist.${bugs > 40 ? ' The product was buggy in places.' : ''}`;
  const comp = compBrief ? `What you use and know today: ${compBrief} Compare honestly: switching cost (data, habits, team), features you'd lose vs. what you use now, and whether an alternative does this cheaper or free. Status quo inertia is strong.` : 'You know of no dedicated tool for this; your alternative is doing it by hand or not at all.';
  if (!p.seat) return `${realism}\nYou are ${p.role}. Context: ${p.context}\n${situation}\n${comp}\n${rubric}`;
  const who = p.company ? `${p.name}, ${p.title} at ${p.company}` : `${p.name}, ${p.title}`;
  const h = p.hidden;
  const pain = !h ? 'You are from outside the market the company targets; you probably do not have the problem it solves.'
    : h.hasPain ? `You genuinely have the problem (how much it hurts, 0-1: ${h.painIntensity}).${h.lastIncident ? ` Last time: ${h.lastIncident}.` : ''}${h.workaround ? ` Today you cope with ${h.workaround}${h.workaroundCostMonthly ? `, roughly $${Math.round(h.workaroundCostMonthly)} a month in time and money` : ''}.` : ''} If the product removes that work you notice; if it does not, you go back to your old way.`
      : `You do not really have this problem right now. Your priorities are ${h.priorities?.join(', ') || 'elsewhere'}. You give the trial little time.`;
  const needs = (p.needs ?? []).map((k) => NEED_RX[k]?.[1]).filter(Boolean);
  return `${realism}
You are ${who}. The company is going after: ${p.context}.
Your seat in the buying decision: ${SEAT_LABEL[p.seat] ?? 'trial user'}.
Your job-to-be-done: ${p.jtbd}.
What you use today: ${p.uses}.
A bad experience you have not forgotten: ${p.burnedBy}.
You are skeptical of: ${p.skeptical}.
Price sensitivity (0-1): ${p.priceSens}.
Your biases: ${(p.biases ?? []).join(' ')}
${needs.length ? `You will not pay without ${needs.join('; ')}.\n` : ''}PRIVATE (never quote numbers from this, let it shape you): ${pain}
${situation}
${comp}
Write ahaMoment, missingMustHaves, quote and vsAlternative in your own first-person voice, as this person would say them, not as a consultant.
${rubric}`;
}

// Offline trial lines per voice family (apps/website/personas.js voices). {feature} {uses} {need} are filled per
// persona. Opinions in the user's own words, never coaching. [design]
const TRIAL_VOICE = {
  builder: { aha: 'Wired "{feature}" into our setup in an afternoon and it just ran.', price: '"{feature}" works, but I could script most of it myself; not at this price.', flat: 'Clicked around for ten minutes and found nothing I can\'t already do with {uses}.', noPain: 'Fine tool. We don\'t have this problem badly enough to add another dependency.', need: 'Couldn\'t get past the trial without {need}.' },
  doer: { aha: 'The first time "{feature}" did the boring part for me I actually smiled.', price: '"{feature}" helps me, but I don\'t hold the budget and this would be a hard ask.', flat: 'I tried, got lost, and went back to {uses} because I had real work to do.', noPain: 'Nice, but my current way works and I had no time to learn something new.', need: 'I needed {need} to use it day to day.' },
  operator: { aha: '"{feature}" saved my team real time this week. I\'d show it to my boss.', price: 'The team liked "{feature}", but I can\'t justify the price yet next to {uses}.', flat: 'Couldn\'t get the team to touch it during the week. Back to {uses}.', noPain: 'Useful in theory. Not what my team is fighting this quarter.', need: 'Without {need} I can\'t roll it out to the team.' },
  owner: { aha: 'It did "{feature}" for me after closing, and that\'s an hour I get back.', price: '"{feature}" is handy, but every monthly bill gets cut when money is tight.', flat: 'I signed up, got busy, and never really used it. {uses} still does the job.', noPain: 'We get by fine without it.', need: 'I\'d need {need} before I pay for it.' },
  founder: { aha: '"{feature}" replaced a chore someone was doing by hand. That\'s worth paying for.', price: 'It works, but at this price it doesn\'t replace a cost or a hire.', flat: 'Gave it fifteen minutes between meetings and didn\'t see the point.', noPain: 'Not something we\'re losing money on.', need: 'Missing {need}, and I won\'t wait for it.' },
  money: { aha: '"{feature}" showed a result I could put a number on. That I can approve.', price: 'I can see "{feature}" working, but the math against {uses} doesn\'t clear yet.', flat: 'Nothing in the trial gave me a number to justify it.', noPain: 'Not a cost line we\'re worried about.', need: 'Without {need} I can\'t sign off on it.' },
  gatekeeper: { aha: 'Behaved itself in our test and "{feature}" did what it says. No red flags.', price: 'Technically fine. Whether it\'s worth the money isn\'t my call, and I wouldn\'t argue for it.', flat: 'Didn\'t get far enough to review it properly.', noPain: 'One more vendor to review for a problem we\'ve handled.', need: 'Automatic no until I see {need}.' },
  consumer: { aha: '"{feature}" worked the first time. Keeping it for now.', price: 'Liked "{feature}", but {uses} is free and close enough.', flat: 'Opened it twice and forgot about it.', noPain: 'I don\'t really need this.', need: 'Couldn\'t find {need}, so I stopped.' },
  legacy: { aha: 'It did one thing I need. Not sure yet it is worth the price.', price: 'It did one thing I need. Not sure yet it is worth the price.', flat: 'I poked around and did not see how this fits my week.', noPain: 'I poked around and did not see how this fits my week.', need: 'I poked around and did not see how this fits my week.' },
};
const fillLine = (line, p, extra) => String(line).replace(/\{(\w+)\}/g, (_, k) => extra[k] ?? (k === 'uses' ? String(p.uses ?? 'what I use now').split(/[;,]/)[0].trim() : '')).trim();

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

// Deterministic offline panelist (same shape as PANEL_SCHEMA).
export function heuristicTrial(state, persona, features, { openBugHours = 0, refPrice = 79, priceMonthly = 79, known = [] } = {}) {
  const jitter = seedOf(persona.id + (persona.seat ? `:${persona.name}:${persona.company ?? ''}` : '') + features.map((f) => f.id).join());
  const icp = `${state.company.icp} ${state.company.oneLiner}`;
  const insights = state.apps.research?.insights ?? [];
  // Usefulness = value delivered (relevance × does it remove their workaround), not how well the spec reads.
  // The hidden person behind a seated panelist: someone who really has the pain gets more out of the same features;
  // someone without it (or an outsider) gets less. Legacy personas (no seat) carry no hidden record.
  const h = persona.seat ? persona.hidden : undefined;
  const painAdj = h === undefined ? 0 : !h ? -0.12 : h.hasPain ? 0.1 * ((h.painIntensity ?? 0.5) - 0.3) : -0.1; // [design]
  const verdicts = features.map((f) => {
    const u = featureValue(f, { icp, insights }) + 0.15 * (jitter - 0.5) - Math.min(0.2, openBugHours / 400) + painAdj;
    return { feature: f.title, verdict: u > 0.45 ? 'useful' : u > 0.25 ? 'meh' : 'irrelevant', u };
  });
  const useful = verdicts.filter((v) => v.verdict === 'useful').length;
  const usefulShare = features.length ? useful / features.length : 0;
  const ob = state.market?.onboarding ?? 'self';
  const role = String(persona.role ?? '');
  const skeptic = persona.seat ? persona.seat === 'skeptic' : /skeptical|price-sensitive|security|churned/.test(role);
  const priceSens = Number.isFinite(persona.priceSens) ? persona.priceSens : role.includes('price-sensitive') ? 1 : 0.5;
  const act = Number.isFinite(persona.act) ? persona.act : 1;
  // Same activation model as Product analytics (incl. the player's lifecycle-email/onboarding-experiment lift) (benchmark 37.5%), driven by the market's (hidden) fit; max 0.6.
  const base = activationRate({ fit: state.market?.fit?.product?.score ?? 0.3, onboarding: ob, lift: insightsModel.activationLift?.(state) ?? 0 });
  const pAct = clamp(base * act - (state.company.website ? 0 : 0.1) - (skeptic ? 0.1 : 0) + (h === undefined ? 0 : h?.hasPain ? 0.08 : -0.05), 0.02, 0.6);
  const alt = incumbentAlternative(known);
  const switching = alt ? (alt.statusQuo ? 0.05 : 0.12) : 0; // [design] switching cost from what they already use
  const all = features.map((f) => `${f.title} ${f.solution} ${acceptanceList(f).join(' ')}`).join(' ').toLowerCase();
  // This person's own deal-breakers (their seat's needs), checked against what actually shipped.
  const unmet = (persona.needs ?? []).filter((k) => NEED_RX[k] && !NEED_RX[k][0].test(all) && !(k === 'setup' && ob !== 'self'));
  const activated = useful > 0 && jitter < pAct - switching - (unmet.length ? 0.06 : 0);
  const sensMult = persona.seat ? 1.25 - 0.75 * priceSens : priceSens >= 1 ? 0.5 : 1;
  const wtp = Math.round(refPrice * (0.25 + 0.9 * usefulShare) * (0.6 + 0.6 * jitter) * sensMult * (activated ? 1 : 0.5));
  const missing = [
    ...unmet.map((k) => `I need ${NEED_RX[k][1]}`),
    !/integrat|sync|import|connect|api/.test(all) && 'Works with the tools I already use (import/sync)',
    !/team|invite|share|role|permission/.test(all) && state.company.model !== 'b2c' && 'A way to share it with my team',
    !/export|csv|pdf|report/.test(all) && 'Export or a report I can show someone',
    openBugHours > 40 && 'It needs to stop breaking',
    alt && !alt.statusQuo && `Parity with ${alt.name} before I switch`,
  ].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, 2);
  const altPrice = alt?.priceMonthlyUSD;
  const cheaper = alt && !alt.statusQuo && (alt.freeTier || (altPrice != null && altPrice < priceMonthly));
  const wtpAdj = cheaper ? Math.round(wtp * 0.75) : wtp;
  const wouldPay = activated && wtpAdj >= priceMonthly && seedOf(persona.id + 'pay') < 0.5;
  const top = verdicts.filter((v) => v.verdict === 'useful').sort((a, b) => b.u - a.u)[0]?.feature;
  const voice = TRIAL_VOICE[persona.seat ? persona.voice : 'legacy'] ?? TRIAL_VOICE.operator;
  const extra = { feature: top ?? features[0]?.title ?? 'it', need: unmet.length ? NEED_RX[unmet[0]][1] : '', uses: alt?.name };
  const line = activated ? (wouldPay ? voice.aha : voice.price) : unmet.length ? voice.need : h && !h.hasPain ? voice.noPain : voice.flat;
  return {
    activated,
    ahaMoment: activated ? `When "${top}" worked on my own data${h?.hasPain && h.ago ? `: the same job that went wrong on me ${h.ago}` : ''}.` : 'none',
    wouldPay,
    willingnessToPayMonthly: wtpAdj,
    missingMustHaves: missing,
    featureVerdicts: verdicts.map(({ feature, verdict }) => ({ feature, verdict })),
    churnRisk: clamp(0.75 - 0.5 * usefulShare + openBugHours / 500 - (activated ? 0.15 : 0) + 0.1 * (priceSens - 0.5), 0.05, 0.95),
    quote: fillLine(line, persona, extra),
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
