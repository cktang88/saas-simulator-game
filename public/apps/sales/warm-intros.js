// Warm intros and referrals: a structured double opt-in intro flow with a per-connector goodwill ledger.
// Research: docs/research/cold-email-alternatives-2026.md section 4 (warm intros and referrals), "Operator tiers per
// motion" and "Simulation hooks"; intro funnel by tie strength in data/inbound-archetypes.js INTRO_FUNNEL.
//
// The flow a real founder runs: (1) map who knows your ICP (network, customers, investors, advisors), (2) find a
// specific target through LinkedIn mutuals and shared past employers, (3) pre-qualify the target, (4) ask one
// connector for one named person with a forwardable blurb, (5) the connector asks the target first (double opt-in;
// either can say no), (6) reply to the intro within a day or two, (7) close the loop with the connector and repay.
//
// Hidden truth: who knows whom (ties), how close they are, and whether the target really fits. The player only sees
// what mapping mutuals and pre-qualifying reveal. Outcome odds depend on what the player did (target specificity,
// fit, tie closeness, blurb quality, timing, goodwill), never on volume.
//
// State: state.apps.warm = { ledger: { [connectorId]: {...} }, ties: { [connectorId]: [...] }, seen: { [tieId]: {...} },
// requests: [...] }. Randomness: rng(state) for decisions; tie generation uses a per-game name stream and hashes so
// opening the tab never moves the main sequence.

import { ensure, notify, log } from '../../core/state.js';
import { uid, chance, clamp, hash } from '../../core/util.js';
import { timeline } from '../../core/timing.js';
import { newThread, addMessage } from '../../core/mail.js';
import { personName, nameStream } from '../../core/names.js';
import { registerOperatorReader, logMistake, tierFromScore, shrink, trapCoaching, unknownRead } from '../../core/operator.js';
import { judgeBlurb } from '../../core/intro-blurb.js';
import { INTRO_FUNNEL } from '../../data/inbound-archetypes.js';
import { addInboundLead } from './crm-api.js';
import { ensureCrm } from './model.js';

const F = INTRO_FUNNEL;
const mid = (r, d) => (Array.isArray(r) ? (r[0] + r[1]) / 2 : r ?? d);
const unit = (key) => (parseInt(hash(String(key)), 36) % 100003) / 100003;
const FN = 'warm_intros';

export const WI = {
  // Founder hours. Research section 4: 1-2 h to prepare an ask list and blurbs; 20-30 min per intro request and
  // follow-up. The splits below are [design].
  hours: { map: 0.25, mapCompany: 0.25, prequal: 0.25, ask: 0.4, vagueAsk: 0.1, closeLoop: 0.15, favor: 0.75 },
  discoverRate: 0.7, // [design] LinkedIn mutuals + shared past employers surface about 70% of real ties
  prequalAccuracy: 0.8, // [design] a site + LinkedIn check reads true fit right about 4 times in 5
  // Base chance the connector makes the intro. Network/investor/advisor: INTRO_FUNNEL byStrength [design].
  // Customers by moment: asks after a milestone convert 3-4x better (Gainsight attribution via saasfactor, [unverified]).
  customerMoment: { win: 0.45, happy: 0.3, neutral: 0.13 },
  // Target multipliers [design]: a connector forwards for people they really know; "who do you know?" rarely moves.
  // A happy customer asked "who else has this problem?" does think of someone more often than a casual contact does.
  // A typed segment or a person they do not really know: they may think of someone else from their own ties.
  target: { close: 1.1, worked: 1.0, loose: 0.55, unknown: 0.3, vague: 0.35, customerOpen: 0.6 },
  // Double opt-in: target says yes. Warm intro to meeting 40-70% (research section 4 game values [design]).
  optIn: { base: 0.3, perFit: 0.45, pain: 0.1, closeness: { close: 1.15, worked: 1.0, loose: 0.6 } },
  goodwill: { neutral: 0.6, burned: 0.15, unburn: 0.3, heal: 0.002, closeLoop: 0.08, closeLoopWin: 0.04, favor: 0.1, missedLoop: -0.08, ghosted: -0.15, overAsk: -0.1, poorFit: -0.1, backfire: -0.5 }, // [design]
  loopDays: 21, // [design] thank the connector and say how it went within 3 weeks
  followUpDays: 3, // reply to an intro within a couple of days; "ghosting after an intro is the most common reputational wound"
  // Asks per relationship before fatigue: no benchmark; [design] about 1-2 intros a year unless earlier intros went well.
  fatigue: { perAsk90d: F?.connectorFatigue?.perExtraAskWithin90d ?? -0.15, advisorPerAsk180d: -0.25, overAskWithinDays: 30, maxPerYear: 3, investorMaxPer90d: 2 },
  referralLinkMult: 1.15, // [design] a live referral program gives the customer a one-click path (each extra step cuts participation 10-30%)
  // Ties per connector kind [design]: count range, mean true fit, closeness mix [close, worked, loose].
  ties: {
    network: { n: [1, 3], fit: 0.3, mix: [0.2, 0.4, 0.4] },
    networkIcp: { n: [4, 6], fit: 0.5, mix: [0.2, 0.4, 0.4] },
    customer: { n: [3, 5], fit: 0.6, mix: [0.3, 0.4, 0.3] },
    investor: { n: [3, 6], fit: 0.45, mix: [0.5, 0.4, 0.1] },
    advisor: { n: [2, 5], fit: 0.45, mix: [0.2, 0.4, 0.4] },
  },
  crmKnow: { network: 0.05, customer: 0.04, investor: 0.03, advisor: 0.05 }, // chance a connector knows someone at a CRM company [design]
};

const TITLES = ['Head of Operations', 'VP Finance', 'COO', 'Founder & CEO', 'Director of IT', 'Head of RevOps', 'Operations Manager', 'Controller', 'Marketing Manager', 'Product Lead'];
const SUFFIX = ['Labs', 'Group', 'Logistics', 'Health', 'Studio', 'Systems', 'Partners', 'Works', 'Supply', 'Analytics'];
const ADVISOR_KINDS = ['advisor', 'mentor', 'fractional', 'board'];

export function ensureWarm(state) {
  const w = ensure(state, 'warm', () => ({}));
  w.ledger ??= {};
  w.ties ??= {};
  w.seen ??= {};
  w.requests ??= [];
  return w;
}

// ---------------------------------------------------------------- connectors

const liveAcct = (state, a) => {
  const sub = (state.stripe?.subscriptions ?? []).find((x) => x.id === a.subId);
  return !a.closed && (!sub || sub.status === 'active' || sub.status === 'past_due' || sub.status === 'trialing');
};

/** Everyone you could ask: network people, customer champions, investors on the cap table, advisors. */
export function connectors(state) {
  const out = [];
  for (const p of state.network?.people ?? []) {
    if ((p.strength ?? 0) < 0.05) continue;
    out.push({ id: `net:${p.id}`, kind: 'network', name: p.name, label: [String(p.relation ?? '').replace('_', ' '), p.company].filter(Boolean).join(' · '), strength: p.strength ?? 0.2, ref: p.id });
  }
  const crm = state.apps.crm;
  for (const a of Object.values(state.apps.success?.accounts ?? {})) {
    if (!liveAcct(state, a)) continue;
    const co = crm?.companies?.find((c) => c.id === a.companyId);
    const ct = crm?.contacts?.find((c) => c.id === a.contactId);
    const name = ct ? `${ct.firstName ?? ''} ${ct.lastName ?? ''}`.trim() || 'Your champion' : 'Your champion';
    out.push({ id: `cus:${a.subId}`, kind: 'customer', name, label: `customer · ${co?.name ?? 'account'}`, strength: 0.7, ref: a.subId });
  }
  const fr = state.apps.fundraising;
  const invIds = new Set([...(fr?.cap?.safes ?? []), ...(fr?.cap?.preferred ?? [])].map((x) => x.invId).filter(Boolean));
  for (const inv of fr?.investors ?? []) {
    if (!invIds.has(inv.id)) continue;
    out.push({ id: `inv:${inv.id}`, kind: 'investor', name: inv.name, label: `investor · ${inv.firm ?? ''}`.trim(), strength: 0.75, ref: inv.id });
  }
  for (const src of state.advice?.sources ?? []) {
    if (src.status !== 'active' || !ADVISOR_KINDS.includes(src.kind)) continue;
    out.push({ id: `adv:${src.id}`, kind: 'advisor', name: src.name, label: src.role ?? src.kind, strength: 0.5, ref: src.id });
  }
  return out;
}
export const connectorById = (state, cid) => connectors(state).find((c) => c.id === cid) ?? null;
const personOf = (state, c) => (c?.kind === 'network' ? (state.network?.people ?? []).find((p) => p.id === c.ref) : null);

/** The goodwill ledger for a connector (created on first read). Network goodwill is mirrored on the person so texted asks share it. */
export function ledgerOf(state, cid) {
  const w = ensureWarm(state);
  let l = w.ledger[cid];
  if (!l) {
    const c = connectorById(state, cid);
    const start = c?.kind === 'network' ? clamp(0.45 + 0.25 * (c.strength ?? 0.2), 0.4, 0.7) : c?.kind === 'investor' ? 0.65 : WI.goodwill.neutral;
    l = w.ledger[cid] = { goodwill: +start.toFixed(2), base: +start.toFixed(2), asks: [], favors: [], loopsClosed: 0, loopsMissed: 0, intros: 0, burned: false };
  }
  return l;
}
function setGoodwill(state, cid, delta) {
  const l = ledgerOf(state, cid);
  l.goodwill = +clamp(l.goodwill + delta, 0, 1).toFixed(3);
  if (l.goodwill < WI.goodwill.burned) l.burned = true;
  else if (l.goodwill >= WI.goodwill.unburn) l.burned = false;
  const p = personOf(state, connectorById(state, cid));
  if (p) p.goodwill = l.goodwill;
  return l.goodwill;
}
/** Asks in the last `days` (this flow plus intro asks texted in Messages). */
export function asksWithin(state, cid, days) {
  const l = ledgerOf(state, cid);
  const p = personOf(state, connectorById(state, cid));
  return [...l.asks, ...(p?.asks ?? [])].filter((d) => state.day - d <= days && d <= state.day).length;
}

// ---------------------------------------------------------------- customers: the right moment

/** 'win' (healthy right after a result), 'happy', 'neutral' or 'at_risk' (health under 45). */
export function momentOf(state, acct) {
  const h = acct?.health ?? 60;
  if (h < 45) return 'at_risk';
  if (h >= 70) {
    const planWin = acct.plan?.status === 'achieved' && state.day - (acct.plan.dueDay ?? 0) <= 60;
    const qbrWin = acct.lastQbrDay != null && state.day - acct.lastQbrDay <= 45;
    const expWin = acct.expansion?.status === 'won' && state.day - (acct.expansion.day ?? 0) <= 60;
    return planWin || qbrWin || expWin ? 'win' : 'happy';
  }
  return 'neutral';
}
const acctOf = (state, c) => (c?.kind === 'customer' ? state.apps.success?.accounts?.[c.ref] : null);

// ---------------------------------------------------------------- hidden ties ("who knows whom")

function drawTies(state, c) {
  const w = ensureWarm(state);
  if (w.ties[c.id]) return w.ties[c.id];
  const p = personOf(state, c);
  const spec = c.kind === 'network' ? ((p?.knows ?? []).includes('customer') ? WI.ties.networkIcp : WI.ties.network) : WI.ties[c.kind];
  const r = nameStream(state, `warm:${c.id}`);
  const n = spec.n[0] + Math.floor(r() * (spec.n[1] - spec.n[0] + 1));
  const ties = [];
  const taken = new Set();
  for (let i = 0; i < n; i++) {
    const nm = personName(state, { rand: r, taken, register: false });
    const fit = +clamp(spec.fit + (r() + r() - 1) * 0.45, 0.02, 0.98).toFixed(2);
    const u = r();
    const closeness = u < spec.mix[0] ? 'close' : u < spec.mix[0] + spec.mix[1] ? 'worked' : 'loose';
    const company = `${nm.last} ${SUFFIX[Math.floor(r() * SUFFIX.length)]}`;
    ties.push({ id: `t:${c.id}:${i}`, cid: c.id, name: nm.name, title: fit >= 0.45 ? TITLES[Math.floor(r() * 6)] : TITLES[6 + Math.floor(r() * 4)], company, companyId: null, fit, pain: r() < 0.1 + 0.8 * fit, closeness, discoverable: r() < WI.discoverRate });
  }
  w.ties[c.id] = ties;
  return ties;
}
// Ties to companies already in your CRM (prospects, not customers): deterministic per connector and company.
function crmTies(state, c) {
  const crm = state.apps.crm;
  if (!crm) return [];
  const customers = new Set(Object.values(state.apps.success?.accounts ?? {}).map((a) => a.companyId));
  const pK = WI.crmKnow[c.kind] * (c.kind === 'network' ? 0.5 + (c.strength ?? 0.2) : 1);
  const out = [];
  for (const co of crm.companies ?? []) {
    if (customers.has(co.id) || (c.kind === 'customer' && acctOf(state, c)?.companyId === co.id)) continue;
    const key = `${state.seed}|${c.id}|${co.id}`;
    if (unit(`k${key}`) >= pK) continue;
    const ct = (crm.contacts ?? []).find((x) => x.companyId === co.id && !x.hidden);
    const u = unit(`c${key}`);
    out.push({
      id: `c:${c.id}:${co.id}`, cid: c.id, name: ct ? `${ct.firstName ?? ''} ${ct.lastName ?? ''}`.trim() : 'someone on their team', title: ct?.title ?? '', company: co.name, companyId: co.id,
      fit: co.prospect?.fit ?? co.inboundFit ?? co.research?.fit ?? 0.5, pain: co.inboundPain ?? (co.prospect?.pain ?? unit(`p${key}`) < 0.5),
      closeness: u < 0.25 ? 'close' : u < 0.6 ? 'worked' : 'loose', discoverable: unit(`d${key}`) < WI.discoverRate,
    });
  }
  return out;
}
/** All real ties of a connector (HIDDEN: never render fit, pain or closeness). */
export const tiesOf = (state, c) => [...drawTies(state, c), ...crmTies(state, c)];
const tieById = (state, tieId) => {
  const cid = String(tieId).split(':').slice(1, 3).join(':');
  const c = connectorById(state, cid);
  return c ? tiesOf(state, c).find((t) => t.id === tieId) ?? null : null;
};

/** What the player can see of a tie: name, company, how they are connected (as LinkedIn shows it), pre-qual band. */
export function publicTie(state, t) {
  const seen = ensureWarm(state).seen[t.id] ?? {};
  const kind = t.cid.split(':')[0];
  const how = kind === 'inv' ? 'portfolio company' : kind === 'cus' ? (t.closeness === 'loose' ? 'LinkedIn connection' : 'peer they know from their industry') : t.closeness === 'loose' ? 'LinkedIn connection' : 'worked together';
  return { id: t.id, cid: t.cid, name: t.name, title: t.title, company: t.company, companyId: t.companyId, how, band: seen.band ?? null, seenDay: seen.day ?? null };
}
/** Discovered ties of a connector (after mapping mutuals). */
export const knownTies = (state, c) => tiesOf(state, c).filter((t) => ensureWarm(state).seen[t.id]).map((t) => publicTie(state, t));
export const mapped = (state, cid) => Boolean(ledgerOf(state, cid).mappedDay != null);

/** Check LinkedIn mutuals and shared past employers for one connector. Hours: WI.hours.map. */
export function mapMutuals(state, cid) {
  const c = connectorById(state, cid);
  if (!c) return { ok: false, error: 'Unknown connector' };
  const w = ensureWarm(state);
  const l = ledgerOf(state, cid);
  let found = 0;
  for (const t of tiesOf(state, c)) if (t.discoverable && !w.seen[t.id]) { w.seen[t.id] = { day: state.day, how: 'mutuals' }; found++; }
  l.mappedDay = state.day;
  return { ok: true, found, hours: WI.hours.map };
}
/** Search mutuals at one CRM company across all connectors (the "find a warm path" view). */
export function mapCompany(state, companyId) {
  const w = ensureWarm(state);
  const paths = [];
  for (const c of connectors(state)) for (const t of crmTies(state, c)) {
    if (t.companyId !== companyId || !t.discoverable) continue;
    w.seen[t.id] ??= { day: state.day, how: 'company' };
    paths.push(publicTie(state, t));
  }
  (w.companySearches ??= {})[companyId] = state.day;
  return { ok: true, paths, hours: WI.hours.mapCompany };
}
/** Warm paths already discovered to a CRM company. */
export function pathsTo(state, companyId) {
  return connectors(state).flatMap((c) => crmTies(state, c).filter((t) => t.companyId === companyId && ensureWarm(state).seen[t.id]).map((t) => ({ connector: c, tie: publicTie(state, t) })));
}

/** Pre-qualify a discovered target (their site, LinkedIn, hiring): a noisy read of true fit. */
export function prequalify(state, tieId) {
  const t = tieById(state, tieId);
  const w = ensureWarm(state);
  if (!t || !w.seen[tieId]) return { ok: false, error: 'Map mutuals first: you can only research people you know exist.' };
  const right = unit(`pq|${state.seed}|${tieId}`) < WI.prequalAccuracy;
  const trueBand = t.fit >= 0.6 ? 'strong' : t.fit >= 0.35 ? 'possible' : 'weak';
  const other = { strong: 'possible', possible: unit(`pq2|${tieId}`) < 0.5 ? 'strong' : 'weak', weak: 'possible' }[trueBand];
  w.seen[tieId].band = right ? trueBand : other;
  w.seen[tieId].prequalDay = state.day;
  return { ok: true, band: w.seen[tieId].band, hours: WI.hours.prequal };
}

// ---------------------------------------------------------------- asking

function baseYes(state, c) {
  if (c.kind === 'customer') return null; // by moment
  const s = c.kind === 'investor' ? 0.75 : c.kind === 'advisor' ? 0.5 : c.strength ?? 0.2;
  const tier = s >= 0.66 ? 'strong' : s >= 0.33 ? 'medium' : s >= 0.1 ? 'weak' : 'coldAsk';
  return mid(F?.byStrength?.[tier]?.pIntroMade, { strong: 0.82, medium: 0.55, weak: 0.22, coldAsk: 0.06 }[tier]);
}
const norm = (x) => String(x ?? '').trim().toLowerCase();

/**
 * Ask a connector for an intro. opts: { connectorId, tieId?, targetName?, targetCompany?, blurb, judged? } where
 * judged is an LLM judgement in judgeBlurb's shape (with mock: false); without it the offline heuristic judges.
 * Never charges hours itself: callers wrap it in ctx.act({ hours: res.hours }).
 * Returns { ok, error?, req, hours, notes }.
 */
export function requestIntro(state, { connectorId, tieId = null, targetName = '', targetCompany = '', blurb = '', judged = null } = {}) {
  const c = connectorById(state, connectorId);
  if (!c) return { ok: false, error: 'Pick someone to ask.' };
  const w = ensureWarm(state);
  const l = ledgerOf(state, c.id);
  // Resolve the target: a discovered tie, a typed name/company matched against real ties, or nobody.
  let tie = tieId ? tieById(state, tieId) : null;
  if (tie && tie.cid !== c.id) tie = null;
  if (!tie && (targetName || targetCompany)) {
    tie = tiesOf(state, c).find((t) => (targetCompany && norm(t.company) === norm(targetCompany)) || (targetName && norm(t.name) === norm(targetName))) ?? null;
  }
  const vague = !tie && !norm(targetName) && !norm(targetCompany);
  const unknownTarget = !tie && !vague;
  const tName = tie?.name ?? targetName;
  const tCo = tie?.company ?? targetCompany;
  const j = judged ? { ...judged, mock: judged.mock ?? false } : { ...judgeBlurb(blurb, { targetName: tName, targetCompany: tCo }), mock: true };
  const hours = vague && j.band === 'none' ? WI.hours.vagueAsk : WI.hours.ask;
  const notes = [];
  const req = {
    id: uid('wi'), cid: c.id, kind: c.kind, connectorName: c.name, tieId: tie?.id ?? null, targetName: tName || '', targetCompany: tCo || '',
    vague, unknownTarget, prequalified: Boolean(tie && w.seen[tie.id]?.band), discovered: Boolean(tie && w.seen[tie.id]),
    blurb: String(blurb ?? '').slice(0, 2000), judge: { score: j.score, band: j.band, criteria: j.criteria, mock: j.mock, notes: j.notes ?? [] },
    day: state.day, status: 'asked', hours, loopClosed: false, loopMissed: false, ghosted: false, followedUp: false,
  };
  // Over-asking: a second ask inside a month, or more than about 3 a year, wears the relationship down.
  const recent30 = asksWithin(state, c.id, WI.fatigue.overAskWithinDays);
  const year = asksWithin(state, c.id, 365);
  const recent90 = asksWithin(state, c.id, 90);
  const recent180 = asksWithin(state, c.id, 180);
  const overAsk = c.kind !== 'investor' && (recent30 >= 1 || year >= WI.fatigue.maxPerYear);
  const portfolioSpam = c.kind === 'investor' && (recent90 >= WI.fatigue.investorMaxPer90d || vague);
  l.asks.push(state.day);
  l.lastAskDay = state.day;
  // Probability the connector makes the intro.
  let p;
  let moment = null;
  if (c.kind === 'customer') {
    const acct = acctOf(state, c);
    moment = momentOf(state, acct);
    req.moment = moment;
    if (moment === 'at_risk') return backfire(state, c, acct, req, hours);
    p = WI.customerMoment[moment];
    if (state.apps.organic?.referral?.enabled) p *= WI.referralLinkMult;
    if (acct) acct.lastTouchDay = state.day;
  } else p = baseYes(state, c);
  p *= F?.forwardableMultiplier?.[j.band] ?? { none: 0.5, sloppy: 0.8, crisp: 1.3 }[j.band];
  p *= vague ? (c.kind === 'customer' ? WI.target.customerOpen : WI.target.vague) : unknownTarget ? WI.target.unknown : WI.target[tie.closeness];
  p *= c.kind === 'advisor' ? Math.max(0.1, 1 + WI.fatigue.advisorPerAsk180d * Math.max(0, recent180)) : Math.max(0.1, 1 + WI.fatigue.perAsk90d * Math.max(0, recent90));
  if (portfolioSpam) p *= 0.4;
  p *= l.goodwill < WI.goodwill.burned ? 0 : clamp(l.goodwill / WI.goodwill.neutral, 0.2, 1.4);
  req.p = +clamp(p, 0, 0.95).toFixed(3);
  // Mistakes at ask time (traceable): logged with what they cost.
  const day = state.day;
  if (vague && c.kind !== 'customer') {
    logMistake(state, { functionId: FN, id: 'vague_intro_ask', label: '"Who do you know?" intro ask', app: 'crm', key: `wi_vague:${req.id}`, cost: { hours, days: 7 }, detail: `Asked ${c.name} who they know, with no named target; connectors rarely act on that.`, lesson: 'A stellar operator maps the connector\'s mutuals first and asks for one named person with a reason.' });
    notes.push('No named target: most connectors nod and do nothing.');
  } else if (unknownTarget) {
    logMistake(state, { functionId: FN, id: 'asked_for_unknown_target', label: 'Asked for someone the connector does not know', app: 'crm', key: `wi_unknown:${req.id}`, cost: { hours }, detail: `Asked ${c.name} for an intro to ${tName || tCo}, who is not someone they actually know.`, lesson: 'Check LinkedIn mutuals and shared employers before asking, so the ask is for a real relationship.' });
    notes.push(`${c.name} may not actually know ${tName || tCo}.`);
  }
  if (j.band === 'none') {
    logMistake(state, { functionId: FN, id: 'no_forwardable_blurb', label: 'Intro ask with no forwardable blurb', app: 'crm', key: `wi_noblurb:${req.id}`, cost: { hours: 0.5 }, detail: `Asked ${c.name} for an intro without a forwardable blurb, so they would have to write your pitch.`, lesson: 'Send 3-5 sentences they can forward as-is: who you are, why this person, a small easy-to-decline ask.' });
  }
  if (overAsk) {
    setGoodwill(state, c.id, WI.goodwill.overAsk);
    logMistake(state, { functionId: FN, id: 'over_asked_connector', label: 'Asked the same connector again too soon', app: 'crm', circles: true, key: `wi_over:${req.id}`, cost: { hours, reputation: 1 }, detail: `${recent30 >= 1 ? 'Second intro ask to' : `Ask number ${year + 1} this year to`} ${c.name}; their goodwill fell to ${Math.round(ledgerOf(state, c.id).goodwill * 100)}.`, lesson: 'Spread asks across connectors (about 1-2 per relationship a year) and repay favours between them.' });
    notes.push(`${c.name} has been asked recently; this costs goodwill.`);
  }
  if (portfolioSpam) {
    setGoodwill(state, c.id, WI.goodwill.overAsk);
    logMistake(state, { functionId: FN, id: 'spammed_portfolio', label: 'Spamming your investor\'s portfolio', app: 'crm', circles: true, key: `wi_port:${req.id}`, cost: { hours, reputation: 1 }, detail: `${recent90 >= WI.fatigue.investorMaxPer90d ? `Intro ask number ${recent90 + 1} in 90 days` : 'A "who in your portfolio could use this?" blast'} to investor ${c.name}.`, lesson: 'Ask investors for one or two hand-picked portfolio intros a quarter, with a reason each fits.' });
  }
  req.decideDay = timeline(state, 'investor.intro', [{ label: c.kind === 'customer' ? 'customer champion' : c.kind, pull: c.kind === 'network' && (c.strength ?? 0) >= 0.66 ? -0.4 : 0 }], { def: { median: 3, p90: 10, unit: 'bday', src: '[design]' } }).day;
  w.requests.push(req);
  log(state, 'info', `Intro ask: ${c.name} → ${req.targetName || req.targetCompany || 'anyone'} (blurb ${j.band})`, 'crm');
  return { ok: true, req, hours, notes };
}

function backfire(state, c, acct, req, hours) {
  const w = ensureWarm(state);
  req.status = 'backfired';
  req.p = 0;
  req.outcomeDay = state.day;
  req.loopClosed = true; // nothing to close
  if (acct) { acct.drift = +((acct.drift ?? 0) - 0.1).toFixed(3); acct.referralBackfireDay = state.day; }
  setGoodwill(state, c.id, WI.goodwill.backfire);
  w.requests.push(req);
  logMistake(state, { functionId: FN, id: 'asked_at_risk_customer', label: 'Asked an unhappy customer for referrals', app: 'success', key: `wi_atrisk:${req.id}`, cost: { hours, reputation: 1 }, detail: `Asked ${c.name} (${c.label}) for intros while their account health was ${acct?.health ?? '?'}; they read it as you not listening, and the account's health fell.`, lesson: 'Fix the account first; ask for referrals right after a clear win (a hit success plan or a good QBR).' });
  notify(state, `${c.name} did not take the referral ask well: the account is at risk and it showed. Account health will drop.`, { type: 'bad', app: 'success' });
  return { ok: true, req, hours, notes: ['Backfired: an at-risk customer asked for referrals feels unheard.'] };
}

/** Thank the connector and tell them how it went. */
export function closeLoop(state, reqId) {
  const r = ensureWarm(state).requests.find((x) => x.id === reqId);
  if (!r) return { ok: false, error: 'Unknown request' };
  if (r.loopClosed) return { ok: false, error: 'Already thanked them.' };
  if (!['connector_declined', 'target_declined', 'introduced', 'no_reply'].includes(r.status)) return { ok: false, error: 'Nothing to report back yet.' };
  r.loopClosed = true;
  r.loopDay = state.day;
  const l = ledgerOf(state, r.cid);
  l.loopsClosed++;
  const late = r.loopMissed;
  setGoodwill(state, r.cid, (late ? WI.goodwill.closeLoop / 2 : WI.goodwill.closeLoop) + (r.status === 'introduced' && r.followedUp ? WI.goodwill.closeLoopWin : 0));
  return { ok: true, hours: WI.hours.closeLoop };
}

/** Do the connector a favour (an intro back, feedback, a hire referral, sharing their launch). */
export function returnFavor(state, cid) {
  const c = connectorById(state, cid);
  if (!c) return { ok: false, error: 'Unknown connector' };
  const l = ledgerOf(state, cid);
  const recent = l.favors.some((d) => state.day - d < 30);
  l.favors.push(state.day);
  setGoodwill(state, cid, recent ? WI.goodwill.favor / 3 : WI.goodwill.favor);
  return { ok: true, hours: WI.hours.favor, diminishing: recent };
}

// ---------------------------------------------------------------- daily

function introduce(state, r, tie) {
  const founder = state.founder?.name ?? 'Founder';
  const t = newThread(state, { subject: `Intro: ${founder} <> ${tie.name}${tie.company ? ` (${tie.company})` : ''}`, with: { name: r.connectorName }, kind: 'network', app: 'crm', refId: r.id });
  const first = (x) => String(x ?? '').split(' ')[0];
  const fwd = r.judge.band === 'none' ? `${founder} runs ${state.company?.name ?? 'a startup'}; I think you two should talk.` : r.blurb.slice(0, 700);
  addMessage(state, t.id, { from: 'them', body: `${first(tie.name)}, meet ${founder} (${state.company?.name ?? ''}). As promised, here is the note:\n\n"${fwd}"\n\n${first(founder)}, ${first(tie.name)} said yes, so I'll let you two take it from here.` });
  addMessage(state, t.id, { from: 'them', body: `Thanks ${first(r.connectorName)} (moving you to bcc). ${first(founder)}, happy to find 20 minutes next week. What works?`, meta: { fromName: tie.name } });
  const contact = addInboundLead(state, { name: tie.name, email: '', title: tie.title, company: tie.company, source: 'referral', note: `Warm intro (double opt-in) from ${r.connectorName}`, fit: tie.fit });
  r.contactId = contact?.id ?? null;
  r.threadId = t.id;
  const l = ledgerOf(state, r.cid);
  l.intros++;
  notify(state, `${r.connectorName} introduced you to ${tie.name} (${tie.company}). Reply within a day or two: warm intros go cold fast.`, { type: 'good', app: 'crm' });
}

function followedUp(state, r) {
  if (!r.contactId) return true;
  const crm = ensureCrm(state);
  return !crm.inboundQueue.some((q) => q.contactId === r.contactId && q.status === 'new');
}

/** Daily engine: connector decisions, target opt-ins, ghosting and closing the loop. Call from the CRM's onDay. */
export function warmDay(state) {
  const w = state.apps?.warm;
  if (!w) return;
  for (const [cid, l] of Object.entries(w.ledger)) if (l.goodwill < l.base && !l.burned) l.goodwill = +Math.min(l.base, l.goodwill + WI.goodwill.heal).toFixed(3); // relationships heal slowly
  for (const r of w.requests) {
    if (r.status === 'asked' && state.day >= r.decideDay) {
      const l = ledgerOf(state, r.cid);
      r.outcomeDay = state.day;
      if (l.burned || r.p <= 0) { r.status = 'no_reply'; r.loopClosed = true; continue; }
      if (!chance(state, r.p)) { r.status = 'connector_declined'; notify(state, `${r.connectorName} passed on the intro${r.targetName ? ` to ${r.targetName}` : ''}.`, { app: 'crm' }); continue; }
      // Who they introduce: the named tie, or for a vague ask whoever comes to mind (fit is luck).
      let tie = r.tieId ? tieById(state, r.tieId) : null;
      if (!tie) {
        const c = connectorById(state, r.cid);
        const pool = c ? tiesOf(state, c) : [];
        if (!pool.length) { r.status = 'connector_declined'; r.reason = 'does not know anyone suitable'; continue; }
        tie = pool[Math.floor(unit(`${r.id}|pick`) * pool.length)];
        r.tieId = tie.id;
        r.targetName = tie.name; r.targetCompany = tie.company;
      }
      r.status = 'asking_target';
      r.optinDay = timeline(state, 'investor.intro', [], { def: { median: 3, p90: 10, unit: 'bday', src: '[design]' } }).day;
    } else if (r.status === 'asking_target' && state.day >= r.optinDay) {
      const tie = tieById(state, r.tieId);
      r.outcomeDay = state.day;
      if (!tie) { r.status = 'target_declined'; continue; }
      const O = WI.optIn;
      let q = (O.base + O.perFit * tie.fit + (tie.pain ? O.pain : 0)) * O.closeness[tie.closeness];
      q *= r.judge.criteria?.whyThem >= 0.5 ? 1.1 : 0.85; // the forwarded note says why them
      q = clamp(q, 0.05, 0.92);
      r.q = +q.toFixed(3);
      if (chance(state, q)) { r.status = 'introduced'; introduce(state, r, tie); r.fit = tie.fit; }
      else { r.status = 'target_declined'; notify(state, `${r.connectorName}: ${tie.name} said it is not a priority right now.`, { app: 'crm' }); }
    }
    if (r.status === 'introduced' && !r.followedUp && !r.ghosted) {
      if (followedUp(state, r)) { r.followedUp = true; r.followDay = state.day; }
      else if (state.day - r.outcomeDay > WI.followUpDays) {
        r.ghosted = true;
        setGoodwill(state, r.cid, WI.goodwill.ghosted);
        logMistake(state, { functionId: FN, id: 'ghosted_intro', label: 'Did not reply to a warm intro', app: 'crm', delayed: true, key: `wi_ghost:${r.id}`, cost: { reputation: 2, days: WI.followUpDays }, detail: `${r.targetName} opted in via ${r.connectorName} and heard nothing for ${WI.followUpDays}+ days; ${r.connectorName}'s goodwill fell.`, lesson: 'Reply to every intro within a day, moving the connector to bcc.' });
      }
    }
    if (r.status === 'introduced' && r.followedUp && !r.poorFitChecked && state.day - r.outcomeDay >= 14) {
      r.poorFitChecked = true;
      if ((r.fit ?? 1) < 0.3) {
        setGoodwill(state, r.cid, WI.goodwill.poorFit);
        logMistake(state, { functionId: FN, id: 'poor_fit_intro', label: 'Burned an intro on a poor-fit target', app: 'crm', delayed: true, key: `wi_fit:${r.id}`, cost: { hours: 0.75 }, detail: `The call with ${r.targetName} (${r.targetCompany}) went nowhere: they were not a fit, and ${r.connectorName}'s contact spent time on it.`, lesson: 'Pre-qualify the target (site, team, tools, hiring) before spending a connector\'s favour on them.' });
      }
    }
    if (['connector_declined', 'target_declined', 'introduced'].includes(r.status) && !r.loopClosed && !r.loopMissed && state.day - (r.outcomeDay ?? r.day) > WI.loopDays) {
      r.loopMissed = true;
      const l = ledgerOf(state, r.cid);
      l.loopsMissed++;
      setGoodwill(state, r.cid, WI.goodwill.missedLoop);
      logMistake(state, { functionId: FN, id: 'no_loop_closed', label: 'Never closed the loop with a connector', app: 'crm', delayed: true, key: `wi_loop:${r.id}`, cost: { reputation: 1 }, detail: `${r.connectorName} never heard back about the intro${r.targetName ? ` to ${r.targetName}` : ''} (${WI.loopDays}+ days); their next yes is less likely.`, lesson: 'Thank the connector within a week and tell them how it went, even when it went nowhere.' });
    }
  }
  if (w.requests.length > 400) w.requests.splice(0, w.requests.length - 400);
}

// ---------------------------------------------------------------- summaries for the UI and tests

export const openRequests = (state) => (state.apps.warm?.requests ?? []).filter((r) => ['asked', 'asking_target'].includes(r.status));
export const STATUS_LABEL = {
  asked: 'Waiting on connector', asking_target: 'Connector is asking the target', connector_declined: 'Connector passed', no_reply: 'No reply',
  target_declined: 'Target declined', introduced: 'Introduced', backfired: 'Backfired',
};
/** Next step a player should take on a request (what the UI shows), or ''. */
export function nextStep(state, r) {
  if (r.status === 'introduced' && !r.followedUp && !r.ghosted) return 'Reply to the intro (CRM -> Inbound)';
  if (['connector_declined', 'target_declined', 'introduced'].includes(r.status) && !r.loopClosed) return r.loopMissed ? 'Overdue: thank them and report back' : 'Close the loop: thank them, say how it went';
  return '';
}

export function warmStats(state) {
  const rs = state.apps.warm?.requests ?? [];
  const intro = rs.filter((r) => r.status === 'introduced');
  return {
    asks: rs.length, open: openRequests(state).length, introduced: intro.length,
    meetings: intro.filter((r) => r.followedUp).length,
    // Expected qualified opportunities from the intros you followed up: 25-40% for a well-qualified fit (research [design]).
    expectedOpps: +intro.filter((r) => r.followedUp).reduce((a, r) => a + clamp(0.08 + 0.4 * (r.fit ?? 0.5), 0, 0.5), 0).toFixed(2),
    hours: +rs.reduce((a, r) => a + (r.hours ?? 0), 0).toFixed(2),
  };
}

// ---------------------------------------------------------------- operator reader

/**
 * warm_intros: what the player DID on asks with an outcome or older than a week (min 3): named, discovered targets;
 * pre-qualified fit (hidden truth); blurb quality (offline judgements shrunk harder); closing the loop; hygiene
 * (over-asking, portfolio spam, at-risk asks, ghosting).
 */
export function readWarmIntros(state) {
  const rs = state.apps?.warm?.requests ?? [];
  if (rs.length < 3) return { ...unknownRead(rs.length ? ['Too few intro asks to read yet.'] : []), n: rs.length };
  const n = rs.length;
  const mist = (state.mistakes ?? []).filter((m) => m.functionId === FN);
  const cnt = (id) => mist.filter((m) => m.id === id).length;
  const named = rs.reduce((a, r) => a + (r.vague ? 0 : r.unknownTarget ? 0.5 : 1), 0) / n; // a segment ask is half-specific
  const offline = rs.filter((r) => r.judge?.mock !== false).length;
  const blurbRaw = rs.reduce((a, r) => a + (r.judge?.score ?? 0), 0) / n;
  const blurb = shrink(blurbRaw, n, 0.5, offline > n / 2 ? 4 : 2);
  const fits = rs.map((r) => r.tieId ? tieById(state, r.tieId)?.fit : null).filter((x) => x != null);
  const fitScore = fits.length ? clamp((fits.reduce((a, b) => a + b, 0) / fits.length - 0.2) / 0.5, 0, 1) * (fits.length / n) : 0;
  const finished = rs.filter((r) => ['connector_declined', 'target_declined', 'introduced'].includes(r.status));
  const loopDue = finished.filter((r) => r.loopClosed || r.loopMissed);
  const loop = loopDue.length ? loopDue.filter((r) => r.loopClosed && !r.loopMissed).length / loopDue.length : 0.5;
  const bad = cnt('over_asked_connector') + cnt('spammed_portfolio') + 2 * cnt('asked_at_risk_customer') + 2 * cnt('ghosted_intro');
  const hygiene = clamp(1 - bad / n, 0, 1);
  const score = +(0.15 * named + 0.2 * blurb + 0.25 * fitScore + 0.2 * loop + 0.2 * hygiene).toFixed(3); // [design] weights
  const st = warmStats(state);
  const evidence = [
    `${rs.filter((r) => !r.vague && !r.unknownTarget).length} of ${n} asks named a specific person the connector really knows`,
    `Forwardable blurbs scored ${Math.round(blurbRaw * 100)}/100 on average${offline ? ` (${offline} judged offline)` : ''}`,
    `${rs.filter((r) => r.prequalified).length} targets pre-qualified before asking`,
    loopDue.length ? `Closed the loop on ${loopDue.filter((r) => r.loopClosed && !r.loopMissed).length} of ${loopDue.length} finished intros in time` : 'No finished intros to report back on yet',
    `${st.introduced} intros made, ${st.meetings} followed up`,
  ];
  if (bad) evidence.push(`${cnt('over_asked_connector') + cnt('spammed_portfolio')} over-asks, ${cnt('asked_at_risk_customer')} at-risk customer asks, ${cnt('ghosted_intro')} intros left unanswered`);
  const coaching = [];
  const trap = (id, fb) => trapCoaching(FN, id, fb);
  if (named < 0.7) coaching.push(trap('vague_intro_ask'));
  if (blurbRaw < 0.6) coaching.push(trap('no_forwardable_blurb'));
  if (fits.length && fitScore < 0.5) coaching.push(trap('poor_fit_intro'));
  if (loop < 0.7) coaching.push(trap('no_loop_closed'));
  if (cnt('over_asked_connector') || cnt('spammed_portfolio')) coaching.push(trap('over_asked_connector'));
  if (cnt('asked_at_risk_customer')) coaching.push(trap('asked_at_risk_customer'));
  if (cnt('ghosted_intro')) coaching.push(trap('ghosted_intro'));
  return { tier: tierFromScore(score), score, n, evidence, coaching: coaching.filter(Boolean) };
}
registerOperatorReader(FN, readWarmIntros);
