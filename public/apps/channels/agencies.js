// Niche-aware agency and vendor search: recruiting agencies, marketing agencies, PR firms, dev shops, consultants and
// data/list vendors. A search resolves the player's text to a niche node (core/niche.js; deeper text grows deeper
// nodes with their own research), then builds a roster from that niche's dossier `agencies` entry (disguised names,
// researched price ranges) plus the rest of the local market. Quality is HIDDEN: a few great and expensive firms, many
// mediocre ones, some scammy ones that want money up front. References, a backchannel call and a paid trial reveal it.
// Specialists who know the exact niche get more out of the same skill; they get scarcer the deeper the niche.
//
// Numbers tagged [design] are game assumptions. Price ranges come from the dossier (researched or offline seeds in
// data/niche-seeds.js, which cite market ranges). Design: docs/design/fractal-niches.md.

import { nicheFor, dossierOf, pathOf } from '../../core/niche.js';
import { seeded, fakeName } from '../../core/niche-disguise.js';
import { AGENCY_KINDS } from '../../data/niche-seeds.js';
import { post, addRecurring, balance } from '../../core/bank.js';
import { spendHours, notify } from '../../core/state.js';
import { logMistake } from '../../core/operator.js';
import { clamp, hash, dayOfMonth } from '../../core/util.js';
import { nicheLabel, messageRelevance } from '../growth/nicheUse.js';

export const KINDS = {
  ...Object.fromEntries(AGENCY_KINDS.map((k) => [k.kind, { label: k.label, priceUsd: k.priceUsd, unit: k.unit, pricing: k.pricing }])),
  data: { label: 'data / list vendor', priceUsd: [150, 900], unit: 'per 1,000 verified contacts', pricing: 'Per-record or credit packs; advertised accuracy is rarely what you measure.' }, // [design]
};
export const KIND_IDS = Object.keys(KINDS);
const MONTHLY = new Set(['marketing', 'pr']);
const DEFAULT_UNITS = { marketing: 3, pr: 3, recruiting: 1, dev: 40, consulting: 10, data: 10 }; // months, months, hires, hours, hours, thousands
const DURATION_DAYS = { recruiting: 60, dev: 28, consulting: 14, data: 7 };
export const HOURS = { search: 0.5, references: 1.5, backchannel: 2.5, trial: 2 };
const TRIAL_FRACTION = 0.25; // a paid trial costs a quarter of one unit block [design]

export function inferKind(text) {
  const t = String(text ?? '').toLowerCase();
  if (/recruit|headhunt|talent|staffing|search firm/.test(t)) return 'recruiting';
  if (/\bpr\b|public relations|press|media relations/.test(t)) return 'pr';
  if (/dev shop|software (dev|agency)|development (agency|shop)|contract dev|engineering (agency|shop)|app developer/.test(t)) return 'dev';
  if (/consult|advisor|fractional|expert/.test(t)) return 'consulting';
  if (/data|list vendor|lead list|contact list|database|enrich/.test(t)) return 'data';
  if (/market|seo|ads|growth|demand|content|agency/.test(t)) return 'marketing';
  return null;
}

// tier: share of the market, hidden quality range, where in the price range it sits (great ones are NOT always the priciest) [design]
const TIERS = [
  { id: 'great', p: 0.10, q: [0.82, 0.96], price: [0.7, 1.0], upfront: [0, 0.25] },
  { id: 'good', p: 0.15, q: [0.66, 0.82], price: [0.45, 0.85], upfront: [0, 0.3] },
  { id: 'average', p: 0.25, q: [0.5, 0.66], price: [0.3, 0.7], upfront: [0.1, 0.4] },
  { id: 'mediocre', p: 0.38, q: [0.22, 0.5], price: [0.05, 0.6], upfront: [0.2, 0.5] },
  { id: 'scam', p: 0.12, q: [0.0, 0.1], price: [0.0, 0.35], upfront: [0.6, 1.0] },
];
const FIT = { specialist: 1, vertical: 0.82, generalist: 0.6 };
const SPEC_PRICE = { specialist: 1.25, vertical: 1.05, generalist: 0.9 };
const between = (r, [a, b]) => a + (b - a) * r();

const book = (state) => (state.agencyBook ??= { v: 1, rosters: {}, listings: {}, hidden: {}, known: {}, engagements: [] });

function nodeForQuery(state, query) {
  const q = String(query ?? '').trim();
  let n = q ? nicheFor(state, q, { source: 'agency' }) : null;
  if (!n) n = nicheFor(state, state.company.icp || state.company.oneLiner || '', { source: 'agency' });
  return n;
}

const PITCH = {
  specialist: (L, c) => `We only work with ${L}. ${c.clients} clients like you, ${c.years} years in this niche.`,
  vertical: (L, c) => `We know your industry well and have worked with ${c.clients} firms near ${L}.`,
  generalist: (L, c) => `Full-service team; we adapt to any sector, ${L} included. ${c.clients} clients served.`,
};

function buildRoster(state, node, kind) {
  const d = dossierOf(state, node.id);
  const K = KINDS[kind];
  const label = nicheLabel(state, node.id) || node.label;
  const fromDossier = (d?.agencies ?? []).filter((a) => a.kind === kind);
  const range = fromDossier[0]?.priceUsd ? [fromDossier[0].priceUsd.lo, fromDossier[0].priceUsd.hi] : K.priceUsd;
  const unit = fromDossier[0]?.unit ?? K.unit;
  const pricing = fromDossier[0]?.pricing ?? K.pricing;
  const R = seeded(`agencies|${state.seed ?? 0}|${node.id}|${kind}`);
  const n = 6 + Math.min(3, node.level) + Math.floor(R() * 2);
  const pSpec = node.level >= 2 ? clamp(0.46 - 0.07 * (node.level - 2), 0.12, 0.46) : 0; // deeper niche, fewer true specialists
  const used = new Set();
  const out = [];
  for (let i = 0; i < n; i++) {
    let name = fromDossier[i]?.name;
    if (!name) { let t = 0; do { name = kind === 'data' ? `${fakeName(R, 'company')} Data` : fakeName(R, kind); } while (used.has(name) && ++t < 30); }
    used.add(name);
    let x = R(); const tier = TIERS.find((t) => (x -= t.p) < 0) ?? TIERS[3];
    const u = R();
    const specialty = u < pSpec ? 'specialist' : u < pSpec + 0.35 ? 'vertical' : 'generalist';
    const q = between(R, tier.q);
    const pos = between(R, tier.price);
    const lo = range[0], hi = range[1];
    const price = Math.round((lo + (hi - lo) * pos) * SPEC_PRICE[specialty] / (hi > 2000 ? 100 : hi > 200 ? 10 : 1)) * (hi > 2000 ? 100 : hi > 200 ? 10 : 1);
    const upfrontPct = Math.round(between(R, tier.upfront) * 100) / 100;
    const years = specialty === 'specialist' ? 3 + Math.floor(R() * 8) : 2 + Math.floor(R() * 12);
    const clients = tier.id === 'scam' ? 60 + Math.floor(R() * 200) : specialty === 'specialist' ? 6 + Math.floor(R() * 25) : 15 + Math.floor(R() * 90);
    const id = `ag_${hash(`${state.seed ?? 0}|${node.id}|${kind}|${i}`)}`;
    out.push({
      pub: { id, name, kind, nicheId: node.id, nicheLabel: label, level: node.level, specialty, priceUsd: price, unit, pricing, minMonths: MONTHLY.has(kind) ? (tier.id === 'great' ? 3 : 3 + Math.floor(R() * 4)) : 0, upfrontPct, guaranteeDays: kind === 'recruiting' ? (tier.id === 'scam' ? 0 : [0, 60, 90][Math.floor(R() * 3)]) : 0, claims: { clients, years }, pitch: PITCH[specialty](label || 'your market', { clients, years }), researched: d?.source === 'research' },
      hid: { quality: Math.round(q * 1000) / 1000, tier: tier.id, scam: tier.id === 'scam', fit: FIT[specialty] },
    });
  }
  return out;
}

const view = (state, id) => {
  const B = book(state); const p = B.listings[id]; if (!p) return null;
  const k = B.known[id] ?? {};
  return { ...p, vetting: { references: !!k.refs, backchannel: !!k.back, trial: !!k.trial, outcome: !!k.outcome }, estimate: k.estimate ?? null, estimateSd: k.sd ?? null, referenceNotes: [...(k.refs ?? []), ...(k.back ?? [])].map((r) => r.say), trialNote: k.trial?.note ?? null, engaged: B.engagements.some((e) => e.listingId === id && e.status !== 'ended') };
};

/**
 * Search the market for an agency or vendor. query: any text ("recruiters for senior iOS engineers in Austin fintech");
 * kind: marketing | recruiting | dev | pr | consulting | data (inferred from the text when omitted).
 * The roster is fixed for that (niche, kind): searching again returns the same firms. Hidden quality never appears here.
 */
export function searchAgencies(state, { query = '', kind = null, charge = false } = {}) {
  const k = kind ?? inferKind(query);
  if (!KINDS[k]) throw new Error('Say what kind of firm you want: recruiter, marketing agency, PR firm, dev shop, consultant or data vendor.');
  if (charge) spendHours(state, HOURS.search, 'Searching for an agency');
  const node = nodeForQuery(state, query);
  if (!node) return { kind: k, nicheId: null, listings: [], hours: HOURS.search, note: 'Nothing in your market matches that description yet.' };
  const B = book(state);
  const key = `${node.id}|${k}`;
  if (!B.rosters[key]) {
    const roster = buildRoster(state, node, k);
    B.rosters[key] = roster.map((x) => x.pub.id);
    for (const x of roster) { B.listings[x.pub.id] = x.pub; B.hidden[x.pub.id] = x.hid; }
  }
  const d = dossierOf(state, node.id);
  return { kind: k, nicheId: node.id, nicheLabel: nicheLabel(state, node.id), level: node.level, researched: d?.source === 'research', hours: HOURS.search, listings: B.rosters[key].map((id) => view(state, id)) };
}

export const listing = (state, id) => view(state, id);
const hiddenOf = (state, id) => {
  const h = book(state).hidden[id];
  if (!h) throw new Error('Unknown firm.');
  return h;
};
const noise = (state, id, tag, sd) => { const R = seeded(`agency-noise|${state.seed ?? 0}|${id}|${tag}`); let s = 0; for (let i = 0; i < 6; i++) s += R(); return (s - 3) * sd * 1.4; };
const band = (s) => (s > 0.75 ? 'would hire them again; results beat the plan' : s > 0.55 ? 'fine overall, a couple of misses' : s > 0.35 ? 'late, generic work; needed a lot of chasing' : 'regret it; fought for a refund');

/**
 * Ask for references. The agency picks them, so they flatter (+0.08 on average); a scammy firm often sends people who never
 * worked with it. With backchannel:true you also call a former client the firm did not offer (cost: more hours, no bias).
 */
export function checkReferences(state, id, { backchannel = false, charge = false } = {}) {
  const l = book(state).listings[id]; const h = hiddenOf(state, id);
  if (charge) spendHours(state, backchannel ? HOURS.backchannel : HOURS.references, backchannel ? 'Backchannel on an agency' : 'Agency references');
  const K = (book(state).known[id] ??= {});
  const eff = h.quality * h.fit;
  const mk = (tag, bias, sd) => ({ score: clamp(eff + bias + noise(state, id, tag, sd), 0, 1) });
  if (!backchannel) {
    K.refs = [0, 1, 2].map((i) => {
      const fake = h.scam && seeded(`agency-ref|${state.seed ?? 0}|${id}|${i}`)() < 0.6;
      const r = fake ? { score: 0.9, fake: true } : mk(`ref${i}`, 0.08, 0.12);
      return { ...r, say: fake ? 'A glowing reference who cannot name a single deliverable.' : `${band(r.score)}.` };
    });
  } else {
    K.back = [0, 1].map((i) => { const r = mk(`back${i}`, 0, 0.1); return { ...r, say: `A client they did not list: ${band(r.score)}.` }; });
  }
  updateEstimate(K);
  void l;
  return view(state, id);
}
function updateEstimate(K) {
  const parts = [...(K.refs ?? []).filter((r) => !r.fake).map((r) => [r.score - 0.08, 0.14]), ...(K.back ?? []).map((r) => [r.score, 0.1]), ...(K.trial ? [[K.trial.score, 0.06]] : [])];
  const fakes = (K.refs ?? []).filter((r) => r.fake).length;
  if (!parts.length) { K.estimate = fakes ? 0.5 : null; K.sd = 0.3; return; }
  const w = parts.map(([, sd]) => 1 / (sd * sd));
  const tw = w.reduce((a, b) => a + b, 0);
  K.estimate = Math.round(parts.reduce((a, [s], i) => a + s * w[i], 0) / tw * 100) / 100;
  K.sd = Math.round(Math.sqrt(1 / tw) * 100) / 100;
}

/** A small paid pilot: you pay a quarter of one unit block and see real work, which narrows the estimate the most. */
export function runTrial(state, id, { charge = false } = {}) {
  const l = book(state).listings[id]; const h = hiddenOf(state, id);
  if (charge) spendHours(state, HOURS.trial, 'Agency trial project');
  const cost = Math.round(l.priceUsd * (DEFAULT_UNITS[l.kind] ?? 1) * TRIAL_FRACTION);
  if (balance(state) < cost) throw new Error('Not enough cash for the trial.');
  payOut(state, l, cost, `Trial project: ${l.name}`);
  const K = (book(state).known[id] ??= {});
  const score = clamp(h.quality * h.fit + noise(state, id, 'trial', 0.07), 0, 1);
  K.trial = { score, cost, note: h.scam ? 'The pilot was thin and they pushed for a large prepayment before showing more.' : `Trial work: ${band(score)}.` };
  updateEstimate(K);
  return view(state, id);
}

function payOut(state, l, amount, what) {
  if (!(amount > 0)) return;
  post(state, { amount: -Math.round(amount * 100) / 100, counterparty: l.name, description: what, category: l.kind === 'recruiting' ? 'recruiting' : l.kind === 'dev' || l.kind === 'consulting' ? 'contractors' : 'marketing', method: 'ach', meta: { app: 'agencies', agencyId: l.id } });
}

/** How well a brief points an agency at your niche: specific words of the niche's own plus enough substance (0..1). */
export function briefScore(state, nicheId, brief) {
  const w = String(brief ?? '').split(/\s+/).filter(Boolean).length;
  return clamp(0.5 * Math.min(1, w / 60) + 0.5 * messageRelevance(state, nicheId, brief), 0, 1);
}

/**
 * Hire a firm. Pays the up-front share now (retainers: first month plus any prepaid months, then a monthly bill),
 * records an engagement with the true effectiveness (quality x specialist fit x brief). Scammy firms ghost after the money
 * is in. Returns the engagement and `lessons`: what a stellar operator would have done differently.
 */
export function engage(state, id, { units, brief = '', charge = false } = {}) {
  const B = book(state); const l = B.listings[id]; const h = hiddenOf(state, id);
  if (B.engagements.some((e) => e.listingId === id && e.status === 'active')) throw new Error('You already work with this firm.');
  if (charge) spendHours(state, 1, 'Briefing an agency');
  const n = Math.max(1, Math.round(units ?? DEFAULT_UNITS[l.kind] ?? 1));
  const months = MONTHLY.has(l.kind) ? Math.max(n, l.minMonths) : 0;
  const total = l.priceUsd * (MONTHLY.has(l.kind) ? months : n);
  const prepaid = MONTHLY.has(l.kind) ? Math.min(months, Math.max(1, Math.round(l.upfrontPct * months))) : 0;
  const payNow = MONTHLY.has(l.kind) ? l.priceUsd * prepaid : l.kind === 'recruiting' ? Math.round(total * l.upfrontPct * 0.5) : Math.round(total * l.upfrontPct);
  if (balance(state) < payNow) throw new Error(`Not enough cash: they want ${Math.round(payNow)} up front.`);
  const known = B.known[id] ?? {};
  const bs = briefScore(state, l.nicheId, brief);
  const effectiveness = clamp(h.quality * h.fit * (0.85 + 0.3 * bs), 0, 1);
  payOut(state, l, payNow, `${l.name}: ${MONTHLY.has(l.kind) ? `retainer (${prepaid} month${prepaid > 1 ? 's' : ''} up front)` : 'up-front payment'}`);
  let recurringId = null;
  if (MONTHLY.has(l.kind) && months > prepaid) {
    const r = addRecurring(state, { vendor: l.name, amount: l.priceUsd, category: 'marketing', dayOfMonth: Math.min(28, dayOfMonth(state)), note: `${KINDS[l.kind].label} retainer` });
    recurringId = r.id; r.agencyId = id;
  }
  const eng = {
    id: `eng_${hash(`${id}|${state.day}|${B.engagements.length}`)}`, listingId: id, kind: l.kind, nicheId: l.nicheId, startDay: state.day, units: n, months, total, paid: payNow, recurringId,
    effectiveness: Math.round(effectiveness * 1000) / 1000, briefScore: Math.round(bs * 100) / 100, status: 'active', reviewed: false,
    ghostDay: h.scam ? state.day + 18 + Math.floor(seeded(`ghost|${state.seed ?? 0}|${id}`)() * 20) : null,
    vetted: { references: !!known.refs, backchannel: !!known.back, trial: !!known.trial }, upfrontPct: l.upfrontPct,
  };
  B.engagements.push(eng);
  return { engagement: eng, lessons: lessonsFor(state, eng, l) };
}

function lessonsFor(state, eng, l) {
  const out = [];
  if (!eng.vetted.references && !eng.vetted.backchannel && !eng.vetted.trial) out.push('A stellar operator checks references, calls a client the firm did not list, or pays for a small trial before committing real money.');
  else if (!eng.vetted.backchannel && !eng.vetted.trial) out.push('Offered references are chosen by the firm and flatter. Call a former client they did not list, or run a paid trial.');
  if (l.upfrontPct >= 0.5) out.push('Over half of the money up front is a red flag. Counter with milestone payments or a pay-on-result structure.');
  if (l.specialty === 'generalist' && l.level >= 2) out.push('This is a generalist selling into a niche. Specialists who already know your buyers waste less of your money learning them.');
  if (eng.briefScore < 0.5) out.push('A thin brief gets generic work. Give them your niche\'s words, tools, buyers and one measurable goal.');
  if (MONTHLY.has(l.kind) && l.minMonths >= 5) out.push(`The ${l.minMonths}-month minimum locks you in: ask for a 3-month term with an exit clause.`);
  return out;
}

/** What the engagement actually produced, by kind (hidden quality showing through). Use these to scale downstream effects. */
export function outcomeOf(state, engId) {
  const e = book(state).engagements.find((x) => x.id === engId);
  if (!e) return null;
  const ghosted = e.status === 'ghosted';
  const eff = ghosted ? 0 : e.effectiveness;
  const base = { engagementId: e.id, kind: e.kind, effectiveness: eff, ghosted };
  switch (e.kind) {
    case 'recruiting': return { ...base, qualityShift: Math.round((eff - 0.5) * 28 * 10) / 10, qualitySdMult: Math.round((1.15 - 0.4 * eff) * 100) / 100, polishShift: 0, candidatesMult: 0.5 + eff };
    case 'marketing': return { ...base, leadsMult: Math.round((0.35 + 1.4 * eff) * 100) / 100 };
    case 'pr': return { ...base, placements: Math.round(eff * 4 * e.months / 3 * 10) / 10 };
    case 'dev': return { ...base, scopeDelivered: Math.round(clamp(0.3 + 0.75 * eff, 0, 1) * 100) / 100, defectRate: Math.round((0.35 - 0.3 * eff) * 100) / 100 };
    case 'consulting': return { ...base, usefulness: Math.round(eff * 100) / 100 };
    case 'data': return { ...base, validRate: Math.round(clamp(0.35 + 0.6 * eff, 0, 0.97) * 100) / 100, bounceRate: Math.round((0.6 - 0.55 * eff) * 100) / 100 };
    default: return base;
  }
}

/** An engagement as a sourcing channel for people/candidates.js makeCandidate(state, job, agency): quality shift, spread and polish. */
export function asSourcingAgency(state, engId) {
  const e = book(state).engagements.find((x) => x.id === engId);
  const l = e && book(state).listings[e.listingId];
  if (!l || e.kind !== 'recruiting') return null;
  const o = outcomeOf(state, engId);
  return { id: engId, label: l.name, kind: 'niche_recruiter', qualityShift: o.qualityShift, qualitySdMult: o.qualitySdMult, polishShift: o.polishShift };
}

export function cancelEngagement(state, engId) {
  const B = book(state);
  const e = B.engagements.find((x) => x.id === engId);
  if (!e || e.status === 'ended') return null;
  const l = B.listings[e.listingId];
  const r = e.recurringId && state.recurring.find((x) => x.id === e.recurringId);
  if (r) r.active = false;
  let fee = 0;
  const monthsRun = Math.floor((state.day - e.startDay) / 30);
  if (MONTHLY.has(e.kind) && monthsRun < l.minMonths && e.status !== 'ghosted') {
    fee = Math.round(0.5 * l.priceUsd * Math.max(0, l.minMonths - Math.max(e.months ? Math.round(e.paid / l.priceUsd) : 0, monthsRun)));
    if (fee > 0) { payOut(state, l, fee, `Early termination: ${l.name}`); logMistake(state, { functionId: 'vendor_selection', id: 'agency_early_exit', label: 'Early termination fee on an agency retainer', app: 'agencies', cost: { usd: fee }, key: `agexit:${e.id}`, detail: `You left ${l.name} after ${monthsRun} months of a ${l.minMonths}-month minimum. Negotiate a 3-month term with an exit clause.` }); }
  }
  e.status = 'ended'; e.endDay = state.day; e.exitFee = fee;
  return e;
}

/** Daily: scammy firms go quiet; reviews reveal the true result at day ~45; fixed-scope engagements finish and bill the remainder. */
export function agencyDay(state) {
  const B = state.agencyBook;
  if (!B?.engagements?.length) return;
  for (const e of B.engagements) {
    if (e.status !== 'active') continue;
    const l = B.listings[e.listingId];
    const age = state.day - e.startDay;
    if (e.ghostDay != null && state.day >= e.ghostDay) {
      e.status = 'ghosted';
      notify(state, `${l.name} stopped answering. The deliverables never came and ${Math.round(e.paid).toLocaleString()} dollars are gone.${e.recurringId ? ' Their retainer keeps billing until you cancel it.' : ''}`, { type: 'bad', app: 'agencies' });
      logMistake(state, { functionId: 'vendor_selection', id: 'agency_scam', label: `Paid ${l.name} up front and they vanished`, app: 'agencies', cost: { usd: Math.round(e.paid), hours: 3 }, key: `agscam:${e.id}`, charge: true, delayed: true, detail: `${Math.round(e.upfrontPct * 100)}% was paid up front.${e.vetted.references || e.vetted.backchannel || e.vetted.trial ? '' : ' No references, backchannel or trial were done.'} A stellar operator pays by milestone and checks a client the firm did not list.` });
      continue;
    }
    if (!e.reviewed && age >= 45) {
      e.reviewed = true;
      const K = (B.known[e.listingId] ??= {});
      K.outcome = { score: e.effectiveness };
      K.estimate = e.effectiveness; K.sd = 0.03;
      notify(state, `${l.name}: after ${age} days the results are ${e.effectiveness >= 0.65 ? 'strong' : e.effectiveness >= 0.4 ? 'underwhelming' : 'poor'}.`, { type: e.effectiveness >= 0.4 ? 'info' : 'warn', app: 'agencies' });
      if (e.effectiveness < 0.35) logMistake(state, { functionId: 'vendor_selection', id: 'agency_underperform', label: `${l.name} delivered poor work`, app: 'agencies', cost: { usd: Math.round(e.paid) }, key: `agpoor:${e.id}`, delayed: true, detail: `${e.vetted.trial ? '' : 'No paid trial before committing. '}${l.specialty === 'generalist' ? 'A generalist learning your niche on your budget. ' : ''}Mediocre firms are the majority: vet before you scale.` });
    }
    const dur = DURATION_DAYS[e.kind];
    if (dur && !e.billed && age >= dur) {
      e.billed = true;
      const rest = Math.round(e.total - e.paid);
      if (rest > 0) { payOut(state, l, rest, `${l.name}: balance on delivery`); e.paid += rest; }
      e.status = 'ended'; e.endDay = state.day;
    }
  }
}
