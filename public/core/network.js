// The founder's network: people who contact you (inbound) and people you can reach (outbound texts,
// intro requests). Who contacts you is NOT random: rates come from research-based archetypes
// (public/data/inbound-archetypes.js) scaled by your stage, visibility, business model, path and recent
// public moments (launches, funding announcements, viral posts...). What each contact is really worth
// (waste, scam, intro to a customer/investor, a lead, press...) is decided by the game from the
// archetype's outcome distribution; an LLM then writes the specific person and message about YOUR
// business, consistent with that hidden truth.

import { uid, poisson, rng, chance, pick, clamp } from './util.js';
import { enqueue } from './jobs.js';
import { newThread, addMessage } from './mail.js';
import { notify, log } from './state.js';
import { hasProduct } from './market.js';
import { mrr, activeSubs } from './stripe.js';

import { INBOUND_ARCHETYPES, INTRO_FUNNEL } from '../data/inbound-archetypes.js';

// Static import keeps the simulation deterministic: data is always present from day 1.
const ARCH = INBOUND_ARCHETYPES;
const FUNNEL = INTRO_FUNNEL ?? null;
export const archetypesReady = Promise.resolve();
export const archetypes = () => ARCH ?? [];
export const introFunnel = () => FUNNEL;

const MAX_INBOUND_PER_DAY = 4;
const TRIGGER_WINDOW_DAYS = 14;

export function ensureNetwork(state) {
  state.network ??= { people: [], threads: [], inbound: [], publicEvents: [], intros: [], investorLeads: [], candidateLeads: [], rosterStatus: 'none' };
  return state.network;
}

// Apps call this when something public happens: 'product_hunt_launch', 'funding_announced', 'viral_post',
// 'conference_talk', 'outbound_sent', 'website_live', 'hiring_post', 'press_coverage'.
export function recordPublicEvent(state, type, meta = {}) {
  const n = ensureNetwork(state);
  n.publicEvents.push({ day: state.day, type, meta });
  if (n.publicEvents.length > 300) n.publicEvents.shift();
}

export function companyStage(state) {
  if (!hasProduct(state)) return 'idea';
  if (state.bank.txns.some((t) => t.category === 'investment')) return 'funded';
  if (mrr(state) >= 5000 || activeSubs(state).length >= 25) return 'traction';
  return 'launched';
}

// Audience you can reach publicly: followers + list size (research convention).
export function audience(state) {
  const nw = state.founder.network;
  const organicFollowers = state.apps.organic?.followers ?? 0;
  return (nw.x ?? 0) + (nw.linkedin ?? 0) + (nw.newsletter ?? 0) + organicFollowers;
}
// 0..2 scale used elsewhere for "how visible is this founder" (100 people ≈ 0, 10k ≈ 1, 1M ≈ 2).
export function visibility(state) {
  return Math.max(0, Math.log10(Math.max(audience(state), 10)) - 2) / 2;
}

// Active public events with their age in days (most recent per type).
function recentTriggers(state) {
  const n = ensureNetwork(state);
  const out = new Map();
  for (const e of n.publicEvents) {
    const age = state.day - e.day;
    if (age >= 0 && age <= 120 && (!out.has(e.type) || age < out.get(e.type))) out.set(e.type, age);
  }
  if (state.company.website && !out.has('website_live')) out.set('website_live', 999);
  return out;
}

// Effective rate per research convention (docs/research/inbound-network-calendar.md):
// base × stage × visibility^(log10(audience) − 3) × model × path × trigger boost (decaying linearly).
export function archetypeDailyRate(state, a, triggers = recentTriggers(state)) {
  const m = a.multipliers ?? {};
  const stage = m.stage?.[companyStage(state)] ?? 1;
  const model = m.model?.[state.company.model] ?? 1;
  const path = m.path?.[state.company.path] ?? 1;
  const vis = Math.pow(m.visibility ?? 1, Math.log10(Math.max(audience(state), 10)) - 3);
  let boost = 1;
  for (const t of a.triggers ?? []) {
    if (!triggers.has(t)) continue;
    const age = triggers.get(t);
    const decay = a.triggerDecayDays ?? 14;
    const full = a.triggerBoostByEvent?.[t] ?? a.triggerBoost ?? 1;
    const b = t === 'website_live' && age === 999 ? 1 : 1 + (full - 1) * Math.max(0, 1 - age / decay);
    boost = Math.max(boost, b);
  }
  return ((a.baseRatePerWeek ?? 0) / 7) * stage * model * path * vis * boost;
}

function sampleOutcome(state, a) {
  const outs = a.valueOutcomes?.length ? a.valueOutcomes : [{ outcome: 'waste', p: 1 }];
  const total = outs.reduce((x, o) => x + o.p, 0);
  let r = rng(state) * total;
  for (const o of outs) { r -= o.p; if (r <= 0) return o.outcome; }
  return outs.at(-1).outcome;
}

export function networkDay(state) {
  if (!ARCH) return;
  const n = ensureNetwork(state);
  const triggers = recentTriggers(state);
  let created = 0;
  let overflow = 0;
  for (const a of ARCH) {
    const k = poisson(state, archetypeDailyRate(state, a, triggers));
    overflow += Math.max(0, k - Math.max(0, MAX_INBOUND_PER_DAY - created));
    for (let i = 0; i < k && created < MAX_INBOUND_PER_DAY; i++, created++) {
      const inb = { id: uid('inb'), archetypeId: a.id, category: a.category, channel: a.channel ?? 'email', day: state.day, outcome: sampleOutcome(state, a), status: 'pending', personId: null, threadId: null, engaged: 0, resolved: false };
      n.inbound.push(inb);
      enqueue(state, 'network:inbound', { inboundId: inb.id }, { label: `Inbound ${a.label}` });
    }
  }
  // Beyond what we materialize as real messages, the rest is junk you still skim (~0.5–1 min each).
  if (overflow > 0) {
    n.junkCount = (n.junkCount ?? 0) + overflow;
    state.founder.hoursUsed += overflow * 0.0125;
  }
  // Unattended meetings with network contacts: the opportunity evaporates.
  for (const e of state.calendar?.events ?? []) {
    if (e.app === 'messages' && e.status === 'unattended' && !e.networkHandled) {
      e.networkHandled = true;
      const inb = n.inbound.find((x) => x.id === e.refId);
      if (inb && !inb.resolved) { inb.resolved = true; inb.result = 'no_show_by_founder'; }
    }
  }
  if (n.inbound.length > 800) n.inbound.splice(0, n.inbound.length - 800);
}

export function addPerson(state, p) {
  const n = ensureNetwork(state);
  const person = { id: uid('per'), name: p.name, role: p.role ?? '', company: p.company ?? '', email: p.email ?? '', relation: p.relation ?? 'acquaintance', strength: clamp(p.strength ?? 0.2, 0, 1), knows: p.knows ?? [], howTheyCanHelp: p.howTheyCanHelp ?? '', introducedBy: p.introducedBy ?? null, persona: p.persona ?? '', lastContactDay: state.day, createdDay: state.day, channel: p.channel ?? 'imessage' };
  n.people.push(person);
  return person;
}

export function textThreadFor(state, personId) {
  const n = ensureNetwork(state);
  let t = n.threads.find((x) => x.personId === personId);
  if (!t) {
    const person = n.people.find((x) => x.id === personId);
    t = { id: uid('txt'), personId, channel: person?.channel === 'linkedin' ? 'linkedin' : 'imessage', messages: [], unread: false, lastDay: state.day };
    n.threads.unshift(t);
  }
  return t;
}

export function addText(state, threadId, from, body) {
  const n = ensureNetwork(state);
  const t = n.threads.find((x) => x.id === threadId);
  if (!t) return null;
  t.messages.push({ id: uid('m'), from, body, day: state.day });
  t.lastDay = state.day;
  if (from === 'them') t.unread = true;
  n.threads.splice(n.threads.indexOf(t), 1);
  n.threads.unshift(t);
  return t;
}

// Deliver a generated inbound message to the right inbox.
export function deliverInbound(state, inb, gen) {
  const n = ensureNetwork(state);
  const person = addPerson(state, { name: gen.senderName, role: gen.senderRole, company: gen.senderCompany, email: gen.senderEmail, relation: inb.category, strength: 0.05, persona: gen.hiddenAgenda, channel: inb.channel });
  inb.personId = person.id;
  inb.subject = gen.subject;
  inb.preview = gen.message.slice(0, 140);
  inb.status = 'delivered';
  if (inb.channel === 'email') {
    const t = newThread(state, { subject: gen.subject, with: { name: gen.senderName, email: gen.senderEmail }, kind: 'network', app: 'messages', refId: inb.id });
    addMessage(state, t.id, { from: 'them', body: gen.message });
    inb.threadId = t.id;
  } else {
    const t = textThreadFor(state, person.id);
    addText(state, t.id, 'them', gen.message);
    t.inboundId = inb.id;
    inb.threadId = t.id;
  }
}

// Apply the hidden outcome once the founder has engaged enough (a call, or a few real replies).
export function resolveInbound(state, inb, { addInboundLead } = {}) {
  if (inb.resolved) return null;
  const n = ensureNetwork(state);
  const person = n.people.find((p) => p.id === inb.personId);
  inb.resolved = true;
  let msg = '';
  switch (inb.outcome) {
    case 'intro_customer':
    case 'customer_lead': {
      const lead = { name: inb.outcome === 'customer_lead' ? person?.name : `${pick(state, ['Jordan', 'Priya', 'Alex', 'Morgan', 'Sam', 'Taylor'])} (intro via ${person?.name})`, email: inb.outcome === 'customer_lead' ? person?.email : '', company: person?.company || 'Referred company', source: inb.outcome === 'customer_lead' ? 'inbound' : 'referral', note: `From network contact ${person?.name}` };
      addInboundLead?.(state, lead);
      msg = inb.outcome === 'customer_lead' ? `${person?.name} turned out to be a real potential customer. Added to your CRM inbound.` : `${person?.name} introduced you to a potential customer. Added to your CRM inbound.`;
      break;
    }
    case 'intro_investor':
    case 'investor_meeting':
      n.investorLeads.push({ id: uid('il'), day: state.day, via: person?.name, name: inb.outcome === 'investor_meeting' ? person?.name : null, firm: inb.outcome === 'investor_meeting' ? person?.company : null, warm: true, imported: false });
      msg = inb.outcome === 'investor_meeting' ? `${person?.name} wants to take a real investor meeting. Added to your investor leads.` : `${person?.name} offered a warm intro to an investor. Added to your investor leads.`;
      break;
    case 'intro_partner':
      n.intros.push({ id: uid('intro'), day: state.day, kind: 'partner', via: person?.name, status: 'made' });
      msg = `${person?.name} connected you with a potential partner.`;
      break;
    case 'press':
      recordPublicEvent(state, 'press_coverage');
      msg = `${person?.name}'s piece mentioned you. Expect a bump in inbound.`;
      break;
    case 'hire':
      n.candidateLeads.push({ id: uid('cl'), day: state.day, name: person?.name, role: person?.role, via: 'inbound' });
      msg = `${person?.name} could be a strong hire. Added to candidate leads.`;
      break;
    case 'advice':
      msg = `${person?.name} gave genuinely useful advice.`;
      break;
    case 'scam':
      msg = `${person?.name}'s offer was a pay-to-play scheme. Good thing if you didn't pay.`;
      break;
    default:
      msg = `Nothing came of the exchange with ${person?.name}.`;
  }
  inb.result = inb.outcome;
  log(state, inb.outcome === 'waste' || inb.outcome === 'scam' ? 'info' : 'good', msg, 'messages');
  if (!['waste', 'scam'].includes(inb.outcome)) notify(state, msg, { type: 'good', app: 'messages' });
  return msg;
}

// Will this person make the intro you asked for? Research intro funnel by tie strength, adjusted for
// the quality of your forwardable blurb, how often you've asked them lately, and the target type.
const mid = (r, fallback) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r ?? fallback);
export function introDecision(state, person, { message = '', targetKind = 'customer' } = {}) {
  const f = FUNNEL;
  const s = person.strength ?? 0.2;
  const tier = s >= 0.66 ? 'strong' : s >= 0.33 ? 'medium' : s >= 0.1 ? 'weak' : 'coldAsk';
  let p = mid(f?.byStrength?.[tier]?.pIntroMade, { strong: 0.82, medium: 0.55, weak: 0.22, coldAsk: 0.06 }[tier]);
  // Forwardable blurb: a crisp 2–4 sentence blurb they can forward as-is helps; none hurts.
  const wordsN = message.trim().split(/\s+/).filter(Boolean).length;
  const blurb = wordsN >= 45 ? 'crisp' : wordsN >= 20 ? 'sloppy' : 'none';
  p *= f?.forwardableMultiplier?.[blurb] ?? { none: 0.5, sloppy: 0.8, crisp: 1.3 }[blurb];
  // Connector fatigue: each extra ask within 90 days lowers the odds.
  const recentAsks = (person.asks ?? []).filter((d) => state.day - d <= 90).length;
  p *= Math.max(0.1, 1 + (f?.connectorFatigue?.perExtraAskWithin90d ?? -0.15) * recentAsks);
  p *= f?.targetTypeModifier?.[targetKind] ?? 1;
  (person.asks ??= []).push(state.day);
  p = Math.min(0.95, Math.max(0.01, p));
  return { tier, blurb, made: chance(state, p), p };
}

export function meetingGivenIntro(state, person) {
  const s = person.strength ?? 0.2;
  const tier = s >= 0.66 ? 'strong' : s >= 0.33 ? 'medium' : s >= 0.1 ? 'weak' : 'coldAsk';
  return chance(state, mid(FUNNEL?.byStrength?.[tier]?.pMeetingGivenMade, 0.5));
}
